import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Radio, X, MapPin, AlertTriangle, Send, Users, Clock,
  CheckCircle2, LocateFixed, Eye, EyeOff, HandCoins, HeartHandshake,
  RefreshCw, Signal, MessageSquare, Wifi, WifiOff, Trash2,
} from 'lucide-react';

/**
 * Ocean — Offline Mesh & Store-and-Forward Emergency Relay
 * ---------------------------------------------------------
 * A civic-resilience communication fallback for when the cellular / internet
 * network is down during a disaster. Extends the emergency UX (EmergencyView /
 * turtleEmergencyPoolsBackend) with a low-bandwidth relay network.
 *
 *  - Relay tab: broadcast a short emergency note (kind + urgency + body + FUZZY
 *    area). Precise location is attached ONLY if you tick the opt-in on that tap,
 *    and is visible only to you and the people who relayed the message. Tap "Relay"
 *    on someone's message to forward it onward (+hop) and earn safety coins.
 *  - Sync tab: store-and-forward catch-up. While you were offline the server queued
 *    relays like a mesh node; "Sync now" delivers everything you missed.
 *  - Reach tab: an OPT-IN fuzzy-area beacon ("I'm here / I can help") so neighbors
 *    know who is reachable. Beacons are fuzzy area labels only — never precise
 *    coordinates — and go stale after 3h.
 *
 *  Backed by /api/mesh/* (turtleOfflineMeshBackend.ts).
 */

interface OfflineMeshViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

type Kind = 'need_help' | 'can_help' | 'info' | 'check_in' | 'resource';
type MeshUrgency = 'critical' | 'high' | 'medium' | 'low';
type RelayStatus = 'active' | 'acknowledged' | 'resolved' | 'expired';
type Tab = 'relay' | 'sync' | 'reach';
type BoardScope = 'active' | 'mine' | 'resolved';

interface MeshRelay {
  id: string;
  seq: number;
  kind: Kind;
  urgency: MeshUrgency;
  body: string;
  area: string;
  authorId: string;
  authorName: string;
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  hopCount: number;
  relayed: boolean;
  isMine: boolean;
  ackCount: number;
  reportCount: number;
  status: RelayStatus;
  createdAt: number;
  expiresAt: number;
}

interface Beacon {
  userId: string;
  userName: string;
  area: string;
  status: 'online' | 'offline';
  capacity: 'can_help' | 'need_help' | 'neutral';
  note: string;
  updatedAt: number;
  stale?: boolean;
}

interface Meta {
  disclaimer: string;
  kinds: Kind[];
  urgencies: MeshUrgency[];
  coinRewards: { relay: number; firstBeacon: number };
  maxBody: number;
  maxArea: number;
  cooldownSec: number;
  viewerId: string | null;
}

interface MeshStatus {
  activeRelays: number;
  activeInLast30m: number;
  unread: number;
  freshBeacons: number;
  myRelayCount: number;
  myBeacon: Beacon | null;
  cursor: number;
  coinRewards: { relay: number; firstBeacon: number };
}

const KIND_LABEL: Record<Kind, string> = {
  need_help: 'Need help', can_help: 'Can help', info: 'Info',
  check_in: 'Check-in', resource: 'Resource',
};

const URGENCY_STYLE: Record<MeshUrgency, string> = {
  critical: 'bg-red-600', high: 'bg-orange-500', medium: 'bg-amber-400', low: 'bg-emerald-500',
};

const STATUS_STYLE: Record<RelayStatus, string> = {
  active: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  acknowledged: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  expired: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const getCoords = (): Promise<{ lat: number; lng: number } | null> =>
  new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 30000 }
    );
  });

const inputCls =
  'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-rose-400';

const chipCls = (active: boolean) =>
  `font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
    active
      ? 'bg-rose-700 text-white dark:bg-rose-500'
      : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
  }`;

const stoneBtnCls =
  'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50';

export default function OfflineMeshView({ token, currentUser, onClose }: OfflineMeshViewProps) {
  const [tab, setTab] = useState<Tab>('relay');
  const [meta, setMeta] = useState<Meta | null>(null);

  // Relay board
  const [relays, setRelays] = useState<MeshRelay[]>([]);
  const [scope, setScope] = useState<BoardScope>('active');
  const [kindFilter, setKindFilter] = useState<Kind | ''>('');

  // Relay composer
  const [composerOpen, setComposerOpen] = useState(false);
  const [relayForm, setRelayForm] = useState({
    kind: 'need_help' as Kind, urgency: 'critical' as MeshUrgency,
    body: '', area: '', shareLocation: false, acceptedDisclaimer: false,
  });
  const [relayBusy, setRelayBusy] = useState(false);

  // Ack / relay action
  const [ackId, setAckId] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState('');

  // Sync (store-and-forward)
  const [meshStatus, setMeshStatus] = useState<MeshStatus | null>(null);
  const [synced, setSynced] = useState<MeshRelay[]>([]);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  // Beacon
  const [beaconForm, setBeaconForm] = useState({
    area: '', status: 'online' as 'online' | 'offline',
    capacity: 'can_help' as 'can_help' | 'need_help' | 'neutral', note: '',
  });
  const [beaconBusy, setBeaconBusy] = useState(false);
  const [beacons, setBeacons] = useState<Beacon[]>([]);

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  const api = async (path: string, method = 'GET', body?: any) => {
    const res = await fetch(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const loadMeta = useCallback(async () => {
    try {
      const data = await api('/api/mesh/meta', 'GET');
      setMeta(data);
    } catch { /* meta is non-critical */ }
  }, [token]);

  const loadBoard = useCallback(async () => {
    try {
      const q = new URLSearchParams({ status: scope });
      if (kindFilter) q.set('kind', kindFilter);
      const data = await api(`/api/mesh/relay?${q.toString()}`, 'GET');
      setRelays(data.relays || []);
    } catch { /* ignore */ }
  }, [token, scope, kindFilter]);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api('/api/mesh/status', 'GET');
      setMeshStatus(data);
    } catch { /* ignore */ }
  }, [token]);

  const loadBeacons = useCallback(async () => {
    try {
      const data = await api('/api/mesh/beacons', 'GET');
      setBeacons(data.beacons || []);
    } catch { /* ignore */ }
  }, [token]);

  const doSync = useCallback(async (silent = false) => {
    if (!token) return;
    setSyncBusy(true);
    try {
      const data = await api('/api/mesh/sync', 'GET');
      setSynced(data.relays || []);
      setMeshStatus((prev) => (prev ? { ...prev, unread: data.missed, cursor: data.cursor } : prev));
      if (data.missed === 0) {
        setSyncMsg('You are all caught up — no missed relays.');
      } else if (data.relays.length === 0) {
        setSyncMsg(`${data.missed} relay(s) queued while you were offline. Sync again to pull more.`);
      } else {
        setSyncMsg(
          data.wasOffline
            ? `${data.relays.length} relay(s) reached you through the store-and-forward network.`
            : `${data.relays.length} new relay(s) pulled.`
        );
      }
      if (data.missed > 0 && data.relays.length > 0) setTab('sync');
      loadBoard();
    } catch (e: any) {
      if (!silent) toast(e.message || 'Sync failed.', 'destructive');
    } finally {
      setSyncBusy(false);
    }
  }, [token, loadBoard]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { if (tab === 'relay') loadBoard(); }, [tab, loadBoard]);
  useEffect(() => { if (tab === 'sync') { loadStatus(); if (token) doSync(true); } }, [tab, loadStatus, doSync, token]);
  useEffect(() => { if (tab === 'reach') { loadBeacons(); loadStatus(); } }, [tab, loadBeacons, loadStatus]);

  // --- Relay ------------------------------------------------------------------
  const postRelay = async () => {
    if (!relayForm.acceptedDisclaimer) return toast('Please accept the safety agreement.');
    if (relayForm.body.trim().length < 5) return toast('Describe the relay (at least 5 characters).');
    setRelayBusy(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (relayForm.shareLocation) {
        const c = await getCoords();
        if (c) { lat = c.lat; lng = c.lng; }
        else toast('Location unavailable — sending without precise location.', 'destructive');
      }
      const data = await api('/api/mesh/relay', 'POST', {
        kind: relayForm.kind,
        urgency: relayForm.urgency,
        body: relayForm.body.trim(),
        area: relayForm.area.trim(),
        shareLocation: relayForm.shareLocation,
        lat,
        lng,
      });
      setComposerOpen(false);
      setRelayForm({ kind: 'need_help', urgency: 'critical', body: '', area: '', shareLocation: false, acceptedDisclaimer: false });
      toast(
        relayForm.shareLocation
          ? 'Relay broadcast (precise location shared with relayers).'
          : 'Relay broadcast to the mesh network.'
      );
      loadBoard();
    } catch (e: any) {
      toast(e.message || 'Could not post relay.', 'destructive');
    } finally {
      setRelayBusy(false);
    }
  };

  // --- Relay (forward) --------------------------------------------------------
  const relayMessage = async (r: MeshRelay) => {
    try {
      const data = await api(`/api/mesh/relay/${r.id}/ack`, 'POST', { note: ackNote.trim() });
      toast(data.coins > 0 ? `Relayed onward. +${data.coins} safety coins.` : 'Already relayed this message.');
      setAckId(null);
      setAckNote('');
      loadBoard();
    } catch (e: any) {
      toast(e.message || 'Could not relay.', 'destructive');
    }
  };

  const resolveRelay = async (r: MeshRelay) => {
    try {
      await api(`/api/mesh/relay/${r.id}/resolve`, 'POST');
      toast('Relay marked resolved — stay safe.');
      loadBoard();
    } catch (e: any) {
      toast(e.message || 'Could not resolve.', 'destructive');
    }
  };

  const reportRelay = async (r: MeshRelay) => {
    try {
      const data = await api(`/api/mesh/relay/${r.id}/report`, 'POST', { reason: 'fake_request' });
      toast(`Report submitted. Fake relays are removed after 3 reports (${data.reportCount}/3).`);
      loadBoard();
    } catch (e: any) {
      toast(e.message || 'Could not report.', 'destructive');
    }
  };

  // --- Beacon -----------------------------------------------------------------
  const postBeacon = async () => {
    setBeaconBusy(true);
    try {
      const data = await api('/api/mesh/beacon', 'POST', {
        area: beaconForm.area.trim(),
        status: beaconForm.status,
        capacity: beaconForm.capacity,
        note: beaconForm.note.trim(),
      });
      toast(data.coins > 0 ? `Beacon live. +${data.coins} safety coins.` : 'Beacon updated.');
      loadBeacons();
      loadStatus();
    } catch (e: any) {
      toast(e.message || 'Could not post beacon.', 'destructive');
    } finally {
      setBeaconBusy(false);
    }
  };

  const visible = (r: MeshRelay) => {
    const canRelay = !r.isMine && (r.status === 'active' || r.status === 'acknowledged') && !r.relayed;
    const canResolve = r.isMine && (r.status === 'active' || r.status === 'acknowledged');
    return { canRelay, canResolve };
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4"
    >
      <div className="max-w-xl mx-auto space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-red-600/10 flex items-center justify-center">
              <Radio className="text-red-600" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Mesh Relay</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                Offline store-and-forward · when the network is down
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {!token && (
          <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
            Sign in to post relays, relay messages onward, sync missed relays, and set your beacon.
            You can still read the public relay board.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {([['relay', 'Relay'], ['sync', 'Sync'], ['reach', 'Reach']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={chipCls(tab === k)}>
              {label}
            </button>
          ))}
        </div>

        {/* ================= RELAY TAB ================= */}
        {tab === 'relay' && (
          <div className="space-y-4">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 space-y-4">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-red-600/10 flex items-center justify-center shrink-0">
                  <MessageSquare className="text-red-600" size={18} />
                </span>
                <div className="flex-1">
                  <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
                    Low-bandwidth relay network
                  </h3>
                  <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed mt-1">
                    When the internet or mobile network is down, post a short relay — the server holds it
                    like a mesh node and delivers it to devices as they come back online. Your fuzzy area is
                    always shown; precise location is attached only if you opt in, this tap only.
                  </p>
                </div>
              </div>

              {token && (
                <button
                  onClick={() => setComposerOpen(!composerOpen)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl bg-rose-600 text-white font-mono text-[11px] uppercase font-bold tracking-widest hover:bg-rose-500 transition-all shadow-lg"
                >
                  <AlertTriangle size={16} /> {composerOpen ? 'Close relay composer' : 'Post a relay'}
                </button>
              )}

              <AnimatePresence>
                {composerOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    className="rounded-3xl border border-[#ebdcca] dark:border-zinc-800 p-5 space-y-3 bg-white/50 dark:bg-zinc-900/50"
                  >
                    <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">
                      <MessageSquare size={11} /> Compose relay
                    </div>
                    <textarea
                      value={relayForm.body}
                      onChange={(e) => setRelayForm({ ...relayForm, body: e.target.value })}
                      placeholder="What's happening? What do people need to know?"
                      rows={3}
                      maxLength={meta?.maxBody ?? 280}
                      className={inputCls + ' resize-none'}
                    />
                    <div className="text-right font-mono text-[9px] text-[#8a8172]">
                      {(relayForm.body || '').length}/{meta?.maxBody ?? 280}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={relayForm.kind}
                        onChange={(e) => setRelayForm({ ...relayForm, kind: e.target.value as Kind })}
                        className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm"
                      >
                        {(meta?.kinds || ['need_help', 'can_help', 'info', 'check_in', 'resource'] as Kind[]).map((k) => (
                          <option key={k} value={k}>{KIND_LABEL[k] || k}</option>
                        ))}
                      </select>
                      <select
                        value={relayForm.urgency}
                        onChange={(e) => setRelayForm({ ...relayForm, urgency: e.target.value as MeshUrgency })}
                        className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm capitalize"
                      >
                        {(meta?.urgencies || ['critical', 'high', 'medium', 'low'] as MeshUrgency[]).map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <input
                      value={relayForm.area}
                      onChange={(e) => setRelayForm({ ...relayForm, area: e.target.value })}
                      placeholder="Fuzzy area (e.g. Old Town, near the market)"
                      className={inputCls}
                    />

                    <label className="flex items-start gap-2 text-[10px] text-[#5c5446] dark:text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={relayForm.shareLocation}
                        onChange={(e) => setRelayForm({ ...relayForm, shareLocation: e.target.checked })}
                        className="mt-0.5 accent-rose-600"
                      />
                      <span className="flex items-center gap-1">
                        {relayForm.shareLocation ? <Eye size={12} /> : <EyeOff size={12} />}
                        Share my precise location on this relay only (opt-in, this tap only). Visible to you and to relayers.
                      </span>
                    </label>

                    <label className="flex items-start gap-2 text-[10px] text-[#5c5446] dark:text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={relayForm.acceptedDisclaimer}
                        onChange={(e) => setRelayForm({ ...relayForm, acceptedDisclaimer: e.target.checked })}
                        className="mt-0.5 accent-rose-600"
                      />
                      <span>I accept the <b>safety agreement</b>.</span>
                    </label>

                    {relayForm.acceptedDisclaimer && meta?.disclaimer && (
                      <pre className="text-[9px] leading-relaxed text-[#8a8172] dark:text-zinc-500 bg-white/60 dark:bg-zinc-800/60 border border-[#ebdcca] dark:border-zinc-700 rounded-xl p-3 whitespace-pre-wrap max-h-24 overflow-y-auto font-sans">
                        {meta.disclaimer}
                      </pre>
                    )}

                    <button
                      onClick={postRelay} disabled={relayBusy}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-600 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-500 disabled:opacity-50"
                    >
                      <Send size={13} /> {relayBusy ? 'Sending…' : 'Post relay'}
                    </button>
                    <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 text-center">
                      Max 2 relays per 15 minutes
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Board filters */}
            <div className="flex gap-2 flex-wrap">
              {([['active', 'Active'], ['mine', 'Mine'], ['resolved', 'Resolved']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setScope(k)} className={chipCls(scope === k)}>
                  {label}
                </button>
              ))}
              <div className="ml-auto">
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as Kind | '')}
                  className="bg-[#fcfaf4] dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-full px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[#5c5446] dark:text-zinc-300 outline-none"
                >
                  <option value="">All kinds</option>
                  {(['need_help', 'can_help', 'info', 'check_in', 'resource'] as Kind[]).map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
              </div>
            </div>

            {relays.length === 0 ? (
              <div className="py-14 text-center space-y-2 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl">
                <WifiOff className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No relays on the board.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  {scope === 'active' ? 'Be the first to relay news from your area' : 'Relays you post or resolve appear here'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {relays.map((r) => {
                  const { canRelay, canResolve } = visible(r);
                  return (
                    <motion.div
                      key={r.id} layout
                      className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 shadow-sm space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${URGENCY_STYLE[r.urgency]} ${r.urgency === 'critical' ? 'animate-pulse' : ''}`} />
                        <span className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400 px-1.5 py-0.5 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800">
                          {KIND_LABEL[r.kind] || r.kind}
                        </span>
                        <h4 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1 truncate">
                          {r.isMine ? 'Your relay' : `Relay from ${r.authorName}`}
                        </h4>
                        <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                      </div>
                      <p className="text-xs text-[#3a342a] dark:text-zinc-100 leading-relaxed">{r.body}</p>
                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
                        <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {r.area}</span>
                        <span className="flex items-center gap-1"><Signal size={11} /> {r.hopCount} hop{r.hopCount === 1 ? '' : 's'}</span>
                        <span className="flex items-center gap-1"><Users size={11} /> {r.ackCount} relay{r.ackCount === 1 ? '' : 's'}</span>
                        <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(r.createdAt)}</span>
                        {r.shareLocation && <span className="flex items-center gap-1 text-emerald-600"><LocateFixed size={11} /> precise location shared</span>}
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {canRelay && (
                          <button
                            onClick={() => setAckId(ackId === r.id ? null : r.id)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-emerald-800"
                          >
                            <RefreshCw size={12} /> Relay onward (+{meta?.coinRewards.relay ?? 3})
                          </button>
                        )}
                        {r.relayed && (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 size={11} /> You relayed this
                          </span>
                        )}
                        {canResolve && (
                          <button
                            onClick={() => resolveRelay(r)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-emerald-800"
                          >
                            <CheckCircle2 size={12} /> Mark resolved
                          </button>
                        )}
                        {!r.isMine && (
                          <button
                            onClick={() => reportRelay(r)}
                            className="ml-auto text-[#8a8172] dark:text-zinc-500 hover:text-red-600 transition-colors"
                            title={`Report fake relay (${r.reportCount}/3)`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      <AnimatePresence>
                        {ackId === r.id && canRelay && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="space-y-2 overflow-hidden"
                          >
                            <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
                              <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">
                                Relay this onward (adds a hop; reveals precise location to you)
                              </div>
                              <input
                                value={ackNote}
                                onChange={(e) => setAckNote(e.target.value)}
                                placeholder="Optional note to the network (e.g. 'Confirmed — water rising on my street')"
                                className={inputCls}
                              />
                              <button
                                onClick={() => relayMessage(r)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-emerald-800"
                              >
                                <RefreshCw size={12} /> Relay (+{meta?.coinRewards.relay ?? 3})
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= SYNC TAB ================= */}
        {tab === 'sync' && (
          <div className="space-y-4">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full bg-red-600/10 flex items-center justify-center">
                  <Wifi className="text-red-600" size={16} />
                </span>
                <div className="flex-1">
                  <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">Store-and-forward sync</h3>
                  <p className="text-[10px] text-[#8a8172] dark:text-zinc-400">
                    While you were offline, the server held relays for you like a mesh node. Sync to pull them.
                  </p>
                </div>
              </div>

              <button
                onClick={() => doSync(false)} disabled={syncBusy || !token}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-600 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-500 disabled:opacity-50"
              >
                <RefreshCw size={13} className={syncBusy ? 'animate-spin' : ''} /> {syncBusy ? 'Syncing…' : 'Sync now'}
              </button>

              {syncMsg && (
                <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 text-xs text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-emerald-600" /> {syncMsg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3">
                  <div className="font-mono uppercase tracking-wider text-[#8a8172]">Unread for you</div>
                  <div className="font-display font-bold text-2xl text-[#3a342a] dark:text-zinc-100">{meshStatus?.unread ?? 0}</div>
                </div>
                <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3">
                  <div className="font-mono uppercase tracking-wider text-[#8a8172]">Active relays</div>
                  <div className="font-display font-bold text-2xl text-[#3a342a] dark:text-zinc-100">{meshStatus?.activeRelays ?? 0}</div>
                </div>
                <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3">
                  <div className="font-mono uppercase tracking-wider text-[#8a8172]">Relays / last 30m</div>
                  <div className="font-display font-bold text-2xl text-[#3a342a] dark:text-zinc-100">{meshStatus?.activeInLast30m ?? 0}</div>
                </div>
                <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3">
                  <div className="font-mono uppercase tracking-wider text-[#8a8172]">Reachable now</div>
                  <div className="font-display font-bold text-2xl text-[#3a342a] dark:text-zinc-100">{meshStatus?.freshBeacons ?? 0}</div>
                </div>
              </div>

              {!token && (
                <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">Sign in to sync your missed relays.</p>
              )}
            </div>

            {synced.length === 0 ? (
              <div className="py-10 text-center space-y-2 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl">
                <WifiOff className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">Nothing to sync yet.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  Relays posted while you were offline appear here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {synced.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${URGENCY_STYLE[r.urgency]} ${r.urgency === 'critical' ? 'animate-pulse' : ''}`} />
                      <span className="font-mono text-[8px] uppercase tracking-widest text-[#8a8172] dark:text-zinc-400 px-1.5 py-0.5 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800">
                        {KIND_LABEL[r.kind] || r.kind}
                      </span>
                      <span className="font-bold text-xs text-[#3a342a] dark:text-zinc-100 flex-1 truncate">Relay from {r.authorName}</span>
                      <span className="font-mono text-[9px] text-[#8a8172] flex items-center gap-1"><Signal size={10} /> {r.hopCount}h</span>
                    </div>
                    <p className="text-xs text-[#3a342a] dark:text-zinc-100 leading-relaxed">{r.body}</p>
                    <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide flex items-center gap-3">
                      <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {r.area}</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(r.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= REACH TAB ================= */}
        {tab === 'reach' && (
          <div className="space-y-4">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <Radio className="text-red-600" size={15} /> Reachability beacon
                </h3>
                {meshStatus?.myBeacon && (
                  <span className="font-mono text-[8px] uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">
                    live
                  </span>
                )}
              </div>

              <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 flex items-center gap-1">
                <EyeOff size={11} /> Opt-in, fuzzy area only — your precise location is never shared here. Beacons go stale after 3 hours.
              </p>

              {token && (
                <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
                  <input
                    value={beaconForm.area}
                    onChange={(e) => setBeaconForm({ ...beaconForm, area: e.target.value })}
                    placeholder="Fuzzy area (e.g. North Beach)"
                    className={inputCls}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={beaconForm.status}
                      onChange={(e) => setBeaconForm({ ...beaconForm, status: e.target.value as 'online' | 'offline' })}
                      className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm"
                    >
                      <option value="online">Online</option>
                      <option value="offline">Offline</option>
                    </select>
                    <select
                      value={beaconForm.capacity}
                      onChange={(e) => setBeaconForm({ ...beaconForm, capacity: e.target.value as 'can_help' | 'need_help' | 'neutral' })}
                      className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm"
                    >
                      <option value="can_help">I can help</option>
                      <option value="need_help">I need help</option>
                      <option value="neutral">Just checking in</option>
                    </select>
                  </div>
                  <input
                    value={beaconForm.note}
                    onChange={(e) => setBeaconForm({ ...beaconForm, note: e.target.value })}
                    placeholder="Short note (e.g. '2 adults + child, water + food ok')"
                    className={inputCls}
                  />
                  <button
                    onClick={postBeacon} disabled={beaconBusy}
                    className={stoneBtnCls}
                  >
                    <Wifi size={12} /> {beaconBusy ? 'Posting…' : `Post beacon (+${meta?.coinRewards.firstBeacon ?? 5})`}
                  </button>
                </div>
              )}

              {!token && (
                <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">Sign in to post your beacon.</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">
                <Users size={11} /> Reachable neighbors
              </div>
              {beacons.length === 0 ? (
                <div className="py-10 text-center space-y-2 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl">
                  <HeartHandshake className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                  <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No beacons in range.</p>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                    Post a beacon so neighbors know you are reachable
                  </p>
                </div>
              ) : (
                beacons.map((b) => (
                  <div key={b.userId} className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${b.stale ? 'bg-zinc-300' : b.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 flex items-center justify-center text-[11px] font-bold shrink-0">
                      {(b.userName || '?').slice(0, 1).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate flex items-center gap-1.5">
                        {b.userName}
                        {b.capacity === 'can_help' && (
                          <span className="font-mono text-[8px] uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">can help</span>
                        )}
                        {b.capacity === 'need_help' && (
                          <span className="font-mono text-[8px] uppercase bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 px-1.5 py-0.5 rounded-full">needs help</span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1 normal-case"><MapPin size={9} /> {b.area || 'Area not specified'}</span>
                        {b.note && <span className="normal-case">· {b.note}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`font-mono text-[9px] uppercase ${b.stale ? 'text-zinc-400' : b.status === 'online' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {b.stale ? 'stale' : b.status}
                      </div>
                      <div className="font-mono text-[9px] text-[#8a8172]">{timeAgo(b.updatedAt)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Safety coins footer */}
        <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 bg-[#fcfaf4] dark:bg-zinc-900 p-4 space-y-1">
          <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
            <HandCoins size={11} /> Safety coins
          </div>
          <ul className="text-[10px] text-[#8a8172] dark:text-zinc-400 space-y-0.5">
            <li>+{meta?.coinRewards.relay ?? 3} · relay someone's message onward (once per message per user)</li>
            <li>+{meta?.coinRewards.firstBeacon ?? 5} · post your first reachability beacon</li>
            <li>No cost to post a relay — 2 relays / 15 min to prevent network flood.</li>
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
