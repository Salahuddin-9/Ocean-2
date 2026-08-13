import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import {
  X, Radio, Bluetooth, BluetoothConnected, Wifi, WifiOff, MessageSquare,
  QrCode, Link2, Send, Check, CheckCheck, Clock, RefreshCw, Trash2,
  UserRound, Smartphone, ServerCog, LogOut, Copy, Loader2, PlugZap, Zap,
  Signal, ChevronLeft, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import {
  p2p,
  decodeP2PCode,
  type ChatMessage,
  type EngineStatus,
  type PeerState,
  type SimDevice,
  type TransportVia,
} from '../turtleOfflineP2P';
import OfflineMeshView from './OfflineMeshView';

/**
 * Ocean — Offline Peer-to-Peer Chat (Bluetooth + LAN + store-and-forward)
 * ------------------------------------------------------------------------
 * The fully functional offline messaging system. No internet required:
 *  - Bluetooth tab: connect to real BLE devices (Web Bluetooth) or to virtual
 *    devices in the built-in simulator (two tabs / two phones, zero hardware).
 *  - Link tab: create a pairing code (QR / copy-paste) and chat browser to
 *    browser over the local network, completely offline.
 *  - Queue tab: every message persists locally with delivery status; pending
 *    messages auto-deliver the moment a peer comes back in range.
 *  - Relay tab: classic server store-and-forward relay (works when online).
 */

type Tab = 'chat' | 'ble' | 'link' | 'queue' | 'relay';

interface OfflineChatViewProps {
  token?: string | null;
  currentUser?: { id: string; name: string } | null;
  onClose: () => void;
}

const TAB_LIST: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare size={12} /> },
  { id: 'ble', label: 'Bluetooth', icon: <Bluetooth size={12} /> },
  { id: 'link', label: 'Link', icon: <Link2 size={12} /> },
  { id: 'queue', label: 'Queue', icon: <Clock size={12} /> },
  { id: 'relay', label: 'Relay', icon: <ServerCog size={12} /> },
];

const chipCls = (active: boolean) =>
  `font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all cursor-pointer ${
    active
      ? 'bg-teal-700 text-white dark:bg-teal-500'
      : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
  }`;

const inputCls =
  'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-teal-400';

const cardCls =
  'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4';

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function StatusTick({ msg }: { msg: ChatMessage }) {
  if (msg.status === 'delivered') return <CheckCheck size={11} className="text-teal-600" />;
  if (msg.status === 'sent') return <Check size={11} className="text-[#8a8172]" />;
  if (msg.status === 'failed') return <X size={11} className="text-red-500" />;
  return <Clock size={11} className="text-[#8a8172]" />;
}

export default function OfflineChatView({ token, currentUser, onClose }: OfflineChatViewProps) {
  const [tab, setTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>(() => p2p.getMessages());
  const [peers, setPeers] = useState<PeerState[]>(() => p2p.getPeers());
  const [status, setStatus] = useState<EngineStatus>(() => p2p.getStatus());
  const [simDevices, setSimDevices] = useState<SimDevice[]>(() => p2p.simScan());
  const [selected, setSelected] = useState<string | null>(null);
  const [compose, setCompose] = useState('');
  const [myName, setMyName] = useState(() => p2p.getIdentity().name);
  const [editingName, setEditingName] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [bleBusy, setBleBusy] = useState(false);
  const [simBusy, setSimBusy] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const [linkQr, setLinkQr] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [pasteCode, setPasteCode] = useState('');
  const [linkLog, setLinkLog] = useState<string | null>(null);
  const [blePeerName, setBlePeerName] = useState<string | null>(null);
  const [connectTarget, setConnectTarget] = useState<string | null>(null);
  const [showPeerId, setShowPeerId] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const identity = p2p.getIdentity();

  const toast = useCallback((message: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, variant } }));
  }, []);

  // ---- engine subscription -------------------------------------------------
  useEffect(() => {
    const offMessage = p2p.on('message', (m: ChatMessage | string) => {
      if (typeof m === 'string') {
        setMessages([...p2p.getMessages()]);
        return;
      }
      setMessages([...p2p.getMessages()]);
      if (m.direction === 'in') {
        setUnread((prev) => {
          if (selected === m.from) return prev;
          return { ...prev, [m.from]: (prev[m.from] || 0) + 1 };
        });
      }
    });
    const offPeer = p2p.on('peer', () => {
      setPeers(p2p.getPeers());
      // Reflect a freshly connected peer's name onto the thread header.
      if (p2p.getStatus().connectedPeers > 0) setStatus(p2p.getStatus());
    });
    const offStatus = p2p.on('status', (s: EngineStatus) => setStatus(s));
    const offSim = p2p.on('sim-devices', (devs: SimDevice[]) => setSimDevices(devs));
    return () => {
      offMessage();
      offPeer();
      offStatus();
      offSim();
    };
  }, [selected]);

  // ---- thread auto-scroll --------------------------------------------------
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, selected]);

  // ---- refresh virtual device list on mount --------------------------------
  useEffect(() => {
    const t = window.setInterval(() => setSimDevices(p2p.simScan()), 3000);
    return () => clearInterval(t);
  }, []);

  // ---- derived data ---------------------------------------------------------
  const conversationPeers = useMemo(() => {
    const ids = new Map<string, { name: string; lastTs: number }>();
    for (const m of messages) {
      const other = m.direction === 'out' ? m.to : m.from;
      if (!other || other === identity.id) continue;
      const known = peers.find((p) => p.id === other);
      const prev = ids.get(other);
      if (!prev || m.ts > prev.lastTs) {
        ids.set(other, { name: known?.name || other.slice(0, 8), lastTs: m.ts });
      }
    }
    // Add any connected peers with no messages yet so they're reachable.
    for (const p of peers) {
      if (p.connected && !ids.has(p.id)) ids.set(p.id, { name: p.name, lastTs: p.lastSeen });
    }
    return [...ids.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.lastTs - a.lastTs);
  }, [messages, peers, identity.id]);

  const thread = useMemo(
    () =>
      messages.filter(
        (m) => (m.from === identity.id && m.to === selected) || (m.from === selected && m.to === identity.id)
      ),
    [messages, selected, identity.id]
  );

  const selectedPeer = peers.find((p) => p.id === selected);

  // ---- actions --------------------------------------------------------------
  const handleSend = () => {
    const body = compose.trim();
    if (!body || !selected) return;
    p2p.send(selected, body, selectedPeer?.connected ? selectedPeer.via || undefined : undefined);
    setCompose('');
  };

  const saveName = () => {
    p2p.setName(myName);
    setEditingName(false);
    toast('Offline identity updated.');
  };

  const doBleScan = async () => {
    setBleBusy(true);
    setLinkLog(null);
    try {
      const device = await p2p.bleScanAndConnect();
      if (device) {
        setBlePeerName(device.name || 'BLE device');
        toast(`Connected to BLE device: ${device.name || 'device'}`);
        setTab('chat');
      }
    } finally {
      setBleBusy(false);
    }
  };

  const doSimScan = () => {
    setSimBusy(true);
    setSimDevices(p2p.simScan());
    setTimeout(() => setSimBusy(false), 600);
  };

  const doSimConnect = (id: string) => {
    p2p.simConnect(id);
    setConnectTarget(id);
    setTimeout(() => setConnectTarget(null), 1200);
  };

  const createLink = async () => {
    setLinkBusy(true);
    setLinkLog(null);
    try {
      const code = await p2p.rtcCreateOffer();
      setLinkCode(code);
      setPasteCode('');
      setLinkLog('Pairing link created. Share this code with the other person (QR scan or copy).');
      // QR is optional — long offer codes can exceed QR capacity, so a QR
      // failure must never break the (perfectly usable) copy-paste flow.
      try {
        const dataUrl = await QRCode.toDataURL(code, {
          width: 220,
          margin: 1,
          errorCorrectionLevel: 'L',
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        setLinkQr(dataUrl);
      } catch {
        setLinkLog('Pairing link created, but the code is too long for a QR — use copy instead.');
      }
      setTab('link');
    } catch (e: any) {
      setLinkLog(`Could not create link: ${e?.message || e}`);
    } finally {
      setLinkBusy(false);
    }
  };

  const joinLink = async () => {
    const code = pasteCode.trim();
    if (!code) return;
    setLinkBusy(true);
    setLinkLog(null);
    try {
      const decoded = decodeP2PCode(code);
      if (decoded && decoded.answer) {
        await p2p.rtcCompleteOffer(code);
        setLinkLog('Answer applied — establishing direct link…');
        setPasteCode('');
      } else if (decoded && decoded.offer) {
        const answer = await p2p.rtcAcceptOffer(code);
        setLinkCode(answer);
        setLinkQr(
          await QRCode.toDataURL(answer, {
            width: 220,
            margin: 1,
            errorCorrectionLevel: 'L',
            color: { dark: '#0f172a', light: '#ffffff' },
          })
        );
        setPasteCode('');
        setLinkLog('Connection accepted! Share this answer code back with the other person.');
      } else {
        setLinkLog('That code is not recognized. Ask the other person for their pairing code.');
      }
    } catch (e: any) {
      setLinkLog(`Could not join: ${e?.message || e}`);
    } finally {
      setLinkBusy(false);
    }
  };

  const copyLink = async () => {
    const ok = await p2p.copyToClipboard(linkCode);
    toast(ok ? 'Pairing code copied.' : 'Copy failed — select the code manually.', ok ? undefined : 'destructive');
  };

  const resetLink = () => {
    p2p.rtcReset();
    setLinkCode('');
    setLinkQr('');
    setPasteCode('');
    setLinkLog('Link reset.');
  };

  const openPeer = (id: string) => {
    setSelected(id);
    setUnread((prev) => ({ ...prev, [id]: 0 }));
  };

  const closeThread = () => setSelected(null);

  const transportBadge = (via: TransportVia | null | undefined): { label: string; cls: string } => {
    if (via === 'ble') return { label: 'BLUETOOTH', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' };
    if (via === 'sim') return { label: 'SIM·BLE', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' };
    if (via === 'webrtc') return { label: 'LAN LINK', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' };
    return { label: 'QUEUED', cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' };
  };

  const badgeFor = (msg: ChatMessage) =>
    msg.direction === 'in' && !msg.via ? null : transportBadge(msg.via);

  const queue = p2p.getQueue();
  const myPeerShort = identity.id.slice(0, 8);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[116] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
    >
      <div className="max-w-3xl mx-auto space-y-4">
        {/* ============ Header ============ */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-full bg-teal-700/10 flex items-center justify-center shrink-0">
              <Radio className="text-teal-700" size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100 truncate">
                Offline Mesh
              </h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400 truncate">
                Bluetooth · LAN · no internet needed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`hidden sm:flex items-center gap-1.5 font-mono text-[9px] uppercase font-bold px-2.5 py-1 rounded-full border ${
                status.online
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
              }`}
            >
              {status.online ? <Wifi size={10} /> : <WifiOff size={10} />}
              {status.online ? 'online' : 'offline'}
            </span>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all cursor-pointer"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ============ Identity bar ============ */}
        <div className={cardCls + ' flex items-center gap-3'}>
          <span className="w-9 h-9 rounded-full bg-teal-700 text-white flex items-center justify-center shrink-0 text-sm font-bold">
            {(myName || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex gap-1.5">
                <input
                  value={myName}
                  onChange={(e) => setMyName(e.target.value)}
                  maxLength={30}
                  className="flex-1 bg-white dark:bg-zinc-800 border border-teal-300 dark:border-zinc-700 rounded-lg px-2 py-1 text-xs text-[#3a342a] dark:text-zinc-100 outline-none"
                  autoFocus
                />
                <button
                  onClick={saveName}
                  className="px-2.5 py-1 rounded-lg bg-teal-700 text-white text-[9px] font-mono uppercase font-bold cursor-pointer"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingName(true)}
                  className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 hover:text-teal-700 transition-colors cursor-pointer"
                  title="Edit name"
                >
                  {myName}
                </button>
                <span className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">
                  {status.connectedPeers > 0
                    ? `· ${status.connectedPeers} peer${status.connectedPeers > 1 ? 's' : ''} linked`
                    : '· no peers in range'}
                </span>
              </div>
            )}
            <div className="font-mono text-[9px] text-[#8a8172] dark:text-zinc-500 truncate">
              Peer ID:{' '}
              <button
                onClick={() => setShowPeerId((v) => !v)}
                className="underline decoration-dotted cursor-pointer"
                title="Tap to reveal full ID"
              >
                {showPeerId ? identity.id : `${myPeerShort}…`}
              </button>{' '}
              · {queue.length} queued · {status.delivered} delivered
            </div>
          </div>
        </div>

        {/* ============ Tabs ============ */}
        <div className="flex gap-2 flex-wrap">
          {TAB_LIST.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={chipCls(tab === t.id)}>
              <span className="flex items-center gap-1.5">
                {t.icon}
                {t.label}
                {t.id === 'queue' && queue.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[8px] flex items-center justify-center">
                    {queue.length}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        {/* ============ CHAT TAB ============ */}
        {tab === 'chat' &&
          (selected ? (
            <div className={cardCls + ' p-0 overflow-hidden flex flex-col max-h-[62vh]'}>
              {/* thread header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60">
                <button
                  onClick={closeThread}
                  className="p-1.5 rounded-lg hover:bg-[#ebdcca]/50 text-[#5c5446] dark:text-zinc-300 cursor-pointer"
                  aria-label="Back"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="w-8 h-8 rounded-full bg-teal-700/10 text-teal-700 dark:text-teal-300 flex items-center justify-center text-xs font-bold shrink-0">
                  {(selectedPeer?.name || selected.slice(0, 1)).slice(0, 1).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate">
                    {selectedPeer?.name || selected.slice(0, 8)}
                  </div>
                  <div className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-500">
                    {selectedPeer?.connected
                      ? 'live · ' + selectedPeer.via
                      : 'offline · messages queue until they reconnect'}
                  </div>
                </div>
                {selectedPeer?.connected && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>

              {/* messages */}
              <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[200px]">
                {thread.length === 0 && (
                  <div className="py-12 text-center space-y-1">
                    <MessageSquare className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
                    <p className="text-xs text-[#5c5446] dark:text-zinc-300">
                      No messages yet with this peer.
                    </p>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                      Messages are stored on-device and delivered when you are both in range
                    </p>
                  </div>
                )}
                {thread.map((m) => {
                  const mine = m.from === identity.id;
                  const badge = badgeFor(m);
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
                          mine
                            ? 'bg-teal-700 text-white rounded-br-md'
                            : 'bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 text-[#3a342a] dark:text-zinc-100 rounded-bl-md'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <div
                          className={`mt-1 flex items-center justify-end gap-1.5 font-mono text-[8px] uppercase tracking-wider ${
                            mine ? 'text-teal-100/80' : 'text-[#8a8172] dark:text-zinc-500'
                          }`}
                        >
                          {clock(m.ts)}
                          {mine && <StatusTick msg={m} />}
                          {badge && <span className={`px-1 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* composer */}
              <div className="flex gap-2 p-3 border-t border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60">
                <input
                  value={compose}
                  onChange={(e) => setCompose(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={selectedPeer?.connected ? `Message ${selectedPeer.name}…` : 'Message (queued until in range)…'}
                  className={inputCls}
                />
                <button
                  onClick={handleSend}
                  disabled={!compose.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-teal-600 disabled:opacity-40 transition-all cursor-pointer shrink-0"
                >
                  <Send size={13} />
                  Send
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {conversationPeers.length === 0 ? (
                <div className="py-14 text-center space-y-2 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl">
                  <WifiOff className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                  <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">
                    No conversations yet.
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 max-w-xs mx-auto">
                    Connect via Bluetooth or a pairing link to start chatting — fully offline.
                  </p>
                </div>
              ) : (
                conversationPeers.map((c) => {
                  const p = peers.find((x) => x.id === c.id);
                  const last = messages
                    .filter(
                      (m) => (m.from === identity.id && m.to === c.id) || (m.from === c.id && m.to === identity.id)
                    )
                    .sort((a, b) => b.ts - a.ts)[0];
                  const badge = transportBadge(p?.via);
                  return (
                    <button
                      key={c.id}
                      onClick={() => openPeer(c.id)}
                      className="w-full text-left bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-4 flex items-center gap-3 hover:border-teal-400 transition-all cursor-pointer"
                    >
                      <span className="relative shrink-0">
                        <span className="w-10 h-10 rounded-full bg-teal-700/10 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold text-sm">
                          {(c.name || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#fcfaf4] dark:border-zinc-900 ${
                            p?.connected ? 'bg-emerald-500' : 'bg-zinc-300'
                          }`}
                        />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate">{c.name}</span>
                          <span className={`font-mono text-[7px] uppercase px-1.5 py-0.5 rounded ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </span>
                        <span className="block text-[11px] text-[#8a8172] dark:text-zinc-400 truncate mt-0.5">
                          {last ? last.body : 'Say hello…'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right space-y-1">
                        {unread[c.id] ? (
                          <span className="inline-block w-5 h-5 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center ml-auto">
                            {unread[c.id]}
                          </span>
                        ) : (
                          <span className="block font-mono text-[9px] text-[#8a8172]">{last ? timeAgo(last.ts) : ''}</span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ))}

        {/* ============ BLUETOOTH TAB ============ */}
        {tab === 'ble' && (
          <div className="space-y-4">
            {/* Real Bluetooth */}
            <div className={cardCls + ' space-y-3'}>
              <div className="flex items-center gap-2">
                <Bluetooth className="text-blue-600" size={16} />
                <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1">
                  Real Bluetooth (Web Bluetooth)
                </h3>
                {status.ble === 'connected' && (
                  <span className="font-mono text-[8px] uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <BluetoothConnected size={9} /> linked
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 leading-relaxed">
                Scan for nearby BLE devices running the Ocean Mesh GATT service and chat directly over
                the radio — no internet, no server. Works with a native companion app, an ESP32, or any
                BLE peripheral that implements the documented service UUID.
              </p>

              {!p2p.bleSupported() && (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5 text-[10px] text-amber-900 dark:text-amber-200">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  Web Bluetooth is unavailable here — it needs <b>HTTPS or localhost</b> and Chrome/Edge.
                  The virtual simulator below still works anywhere, and so does the offline LAN Link tab.
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={doBleScan}
                  disabled={bleBusy || status.ble === 'connecting' || status.ble === 'connected'}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-blue-600 disabled:opacity-40 transition-all cursor-pointer"
                >
                  <Bluetooth size={12} className={status.ble === 'scanning' ? 'animate-pulse' : ''} />
                  {status.ble === 'connecting' ? 'Connecting…' : status.ble === 'connected' ? 'Connected' : bleBusy ? 'Scanning…' : 'Scan nearby BLE'}
                </button>
                {(status.ble === 'connected' || blePeerName) && (
                  <>
                    <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-[10px] font-mono text-emerald-700 dark:text-emerald-300">
                      <BluetoothConnected size={12} /> {blePeerName || 'device connected'}
                    </span>
                    <button
                      onClick={() => {
                        p2p.bleDisconnect();
                        setBlePeerName(null);
                        toast('Bluetooth link closed.');
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] transition-all cursor-pointer"
                    >
                      <LogOut size={12} /> Disconnect
                    </button>
                  </>
                )}
              </div>
              {status.bleError && (
                <p className="text-[10px] text-rose-600 dark:text-rose-400">{status.bleError}</p>
              )}
            </div>

            {/* Virtual simulator */}
            <div className={cardCls + ' space-y-3'}>
              <div className="flex items-center gap-2">
                <Smartphone className="text-violet-600" size={16} />
                <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1">
                  Virtual BLE simulator
                </h3>
                {status.simAdvertising && (
                  <span className="font-mono text-[8px] uppercase bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-2 py-0.5 rounded-full animate-pulse">
                    advertising
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 leading-relaxed">
                No hardware? Two browser tabs (or two phones on the same Wi-Fi) can test the full
                Bluetooth message flow: open this app in <b>two tabs</b>, switch this toggle ON in one,
                then scan + connect from the other — exactly like real BLE.
              </p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    if (status.simAdvertising) {
                      p2p.simStopAdvertising();
                      toast('Virtual device offline.');
                  } else {
                    const started = p2p.simStartAdvertising(myName);
                    toast(
                      started
                        ? 'Virtual device advertising — scan from another tab.'
                        : 'Virtual device unavailable in this browser.',
                      started ? undefined : 'destructive'
                    );
                  }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono uppercase font-bold transition-all cursor-pointer ${
                    status.simAdvertising
                      ? 'bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b]'
                      : 'bg-violet-700 text-white hover:bg-violet-600'
                  }`}
                >
                  <Zap size={12} />
                  {status.simAdvertising ? 'Stop advertising' : 'Advertise as virtual device'}
                </button>
                <button
                  onClick={doSimScan}
                  disabled={simBusy}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#ebdcca]/40 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-300 text-[10px] font-mono uppercase font-bold hover:bg-[#ebdcca]/70 transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={12} className={simBusy ? 'animate-spin' : ''} /> Scan virtual devices
                </button>
              </div>

              <div className="space-y-2">
                <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 flex items-center gap-1">
                  <Signal size={10} /> Devices in range ({simDevices.length})
                </div>
                {simDevices.length === 0 ? (
                  <div className="text-[10px] text-[#8a8172] dark:text-zinc-500 py-3 text-center border border-dashed border-[#ebdcca] dark:border-zinc-700 rounded-xl">
                    No virtual devices advertising. Toggle the simulator on in another tab.
                  </div>
                ) : (
                  simDevices.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 border border-[#ebdcca]/70 dark:border-zinc-700 rounded-xl px-3 py-2"
                    >
                      <Smartphone size={13} className="text-violet-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-[#3a342a] dark:text-zinc-100 truncate">{d.name}</div>
                        <div className="font-mono text-[8px] text-[#8a8172] dark:text-zinc-500">
                          {d.id.slice(0, 8)}… · {timeAgo(d.lastSeen)}
                        </div>
                      </div>
                      <button
                        onClick={() => doSimConnect(d.id)}
                        disabled={connectTarget === d.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-700 text-white text-[9px] font-mono uppercase font-bold hover:bg-violet-600 disabled:opacity-50 transition-all cursor-pointer"
                      >
                        <PlugZap size={11} /> {connectTarget === d.id ? 'Connecting…' : 'Connect'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============ LINK TAB (WebRTC / LAN) ============ */}
        {tab === 'link' && (
          <div className="space-y-4">
            <div className={cardCls + ' space-y-3'}>
              <div className="flex items-center gap-2">
                <Link2 className="text-teal-700" size={16} />
                <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1">
                  Offline pairing link
                </h3>
                {status.rtc === 'connected' ? (
                  <span className="font-mono text-[8px] uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Zap size={9} /> connected
                  </span>
                ) : status.rtc === 'offering' || status.rtc === 'waiting-answer' || status.rtc === 'connecting' ? (
                  <span className="font-mono text-[8px] uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 rounded-full animate-pulse">
                    pairing…
                  </span>
                ) : null}
              </div>
              <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 leading-relaxed">
                Two people on the <b>same Wi-Fi / local network</b> can chat browser-to-browser with
                <b> zero internet</b>. One person creates a link, the other joins with the code —
                exchange it by QR scan, copy-paste, or showing your screen.
              </p>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={createLink}
                  disabled={linkBusy || status.rtc === 'connected'}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-teal-600 disabled:opacity-40 transition-all cursor-pointer"
                >
                  <QrCode size={12} /> {linkBusy ? 'Generating…' : 'Create pairing link'}
                </button>
                {linkCode && (
                  <button
                    onClick={copyLink}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] transition-all cursor-pointer"
                  >
                    <Copy size={12} /> Copy code
                  </button>
                )}
                {(linkCode || status.rtc !== 'idle') && (
                  <button
                    onClick={resetLink}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#ebdcca]/40 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-300 text-[10px] font-mono uppercase font-bold hover:bg-[#ebdcca]/70 transition-all cursor-pointer"
                  >
                    <LogOut size={12} /> Reset
                  </button>
                )}
              </div>

              {linkQr && (
                <div className="flex items-start gap-3 bg-white dark:bg-zinc-950 border border-[#ebdcca] dark:border-zinc-700 rounded-2xl p-3">
                  <img src={linkQr} alt="Pairing QR code" className="w-28 h-28 rounded-lg shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 mb-1">
                      Scan this QR with the other device, or copy the code below
                    </div>
                    <textarea
                      readOnly
                      value={linkCode}
                      rows={4}
                      className="w-full bg-[#f6f1e7]/60 dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-[9px] font-mono text-[#5c5446] dark:text-zinc-300 break-all"
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                </div>
              )}

              <div className="border-t border-[#ebdcca]/70 dark:border-zinc-700 pt-3 space-y-2">
                <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  I have a pairing code from the other person
                </div>
                <textarea
                  value={pasteCode}
                  onChange={(e) => setPasteCode(e.target.value)}
                  rows={3}
                  placeholder="Paste their code here…"
                  className={inputCls + ' text-[9px] font-mono break-all'}
                />
                <button
                  onClick={joinLink}
                  disabled={linkBusy || !pasteCode.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-teal-600 disabled:opacity-40 transition-all cursor-pointer"
                >
                  <Link2 size={12} /> {linkBusy ? 'Working…' : 'Join link'}
                </button>
              </div>

              {linkLog && (
                <div className="flex items-start gap-2 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 rounded-xl px-3 py-2.5 text-[10px] text-teal-900 dark:text-teal-200">
                  <ShieldCheck size={12} className="mt-0.5 shrink-0" /> {linkLog}
                </div>
              )}
              {status.rtcError && (
                <p className="text-[10px] text-rose-600 dark:text-rose-400">{status.rtcError}</p>
              )}
            </div>

            <div className="text-[9px] font-mono uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 text-center leading-relaxed">
              Direct P2P · end-to-end between the two devices · nothing touches a server
            </div>
          </div>
        )}

        {/* ============ QUEUE TAB ============ */}
        {tab === 'queue' && (
          <div className="space-y-4">
            <div className={cardCls + ' space-y-3'}>
              <div className="flex items-center gap-2">
                <Clock className="text-amber-600" size={16} />
                <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1">
                  Store-and-forward queue
                </h3>
              </div>
              <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 leading-relaxed">
                Every message you send is saved on your device with a delivery status. When the
                recipient is out of range, messages wait here and auto-deliver the moment a Bluetooth
                or LAN link is established. Queues also travel with peers (mesh relay, bounded hops).
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-2">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">Queued</div>
                  <div className="font-display font-bold text-xl text-[#3a342a] dark:text-zinc-100">{status.queued}</div>
                </div>
                <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-2">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">Delivered</div>
                  <div className="font-display font-bold text-xl text-teal-600">{status.delivered}</div>
                </div>
                <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-2">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">Peers linked</div>
                  <div className="font-display font-bold text-xl text-[#3a342a] dark:text-zinc-100">{status.connectedPeers}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    p2p.retryAll();
                    toast('Retrying all queued messages…');
                  }}
                  disabled={status.queued === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-teal-600 disabled:opacity-40 transition-all cursor-pointer"
                >
                  <RefreshCw size={12} /> Retry all
                </button>
                <button
                  onClick={() => {
                    p2p.clearDelivered();
                    toast('Delivered messages cleared from the outbox.');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#ebdcca]/40 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-300 text-[10px] font-mono uppercase font-bold hover:bg-[#ebdcca]/70 transition-all cursor-pointer"
                >
                  <Trash2 size={12} /> Clear delivered
                </button>
              </div>
            </div>

            {queue.length === 0 ? (
              <div className="py-10 text-center space-y-2 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl">
                <CheckCheck className="mx-auto text-teal-600" size={26} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">Outbox is empty.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  Messages you send while offline will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map((m) => {
                  const peerName = peers.find((p) => p.id === m.to)?.name || m.to.slice(0, 8);
                  const statusLabel =
                    m.status === 'delivered'
                      ? { text: 'Delivered', cls: 'text-emerald-600' }
                      : m.status === 'failed'
                        ? { text: 'Failed', cls: 'text-rose-600' }
                        : m.status === 'sent'
                          ? { text: 'Sent (awaiting receipt)', cls: 'text-amber-600' }
                          : { text: 'Queued', cls: 'text-[#8a8172]' };
                  return (
                    <div key={m.id} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 bg-[#fcfaf4] dark:bg-zinc-900 px-3 py-2">
                      <div className="flex items-center gap-2 text-[10px]">
                        <StatusTick msg={m} />
                        <span className="font-bold text-[#3a342a] dark:text-zinc-100 truncate flex-1">→ {peerName}</span>
                        <span className={`font-mono text-[9px] uppercase ${statusLabel.cls}`}>{statusLabel.text}</span>
                      </div>
                      <p className="text-[10px] text-[#8a8172] dark:text-zinc-400 mt-1 truncate">{m.body}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============ RELAY TAB (classic server relay, works online) ============ */}
        {tab === 'relay' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
              <ServerCog size={12} /> Community server relay — needs internet (kept for compatibility)
            </div>
            <OfflineMeshView token={token ?? null} currentUser={currentUser ?? null} onClose={onClose} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
