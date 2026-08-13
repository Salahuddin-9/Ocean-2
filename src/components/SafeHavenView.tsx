import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  House, Plus, X, MapPin, ShieldCheck, Siren, AlertTriangle, CheckCircle2,
  Clock, HeartHandshake, LocateFixed, DoorOpen, BadgeCheck, Phone, Users,
  Navigation, Eye, EyeOff, Ban,
} from 'lucide-react';

/**
 * Ocean — SafeHaven (Safe Place / Emergency Refuge Network)
 * ---------------------------------------------------------
 * A civic-resilience layer that extends the Emergency UX:
 *  - Safe havens: a community registry of verified refuges (shops, cafes,
 *    pharmacies, transit stops, medical points, homes). Fuzzy area label only —
 *    an exact address is never stored or broadcast. Neighbours verify a haven;
 *    the owner toggles open/closed.
 *  - "I'm seeking refuge": a one-tap panic broadcast. Fuzzy area is always
 *    shared; precise GPS is attached ONLY if the user opts in on that tap and is
 *    revealed only to the initiator, acknowledged responders and the haven
 *    operator. Reaches the user's own safety circle (their explicit contacts).
 *  - Safety coins: register, verify, acknowledge a refuge event, and the haven
 *    operator is rewarded when a referenced refuge event resolves.
 *
 * Backed by /api/safehaven/* (turtleSafeHavenBackend.ts).
 */

type HavenType = 'shop' | 'cafe' | 'pharmacy' | 'transit' | 'medical' | 'community' | 'home' | 'other';
type RefugeStatus = 'active' | 'resolved' | 'expired' | 'suppressed';
type AckType = 'on_my_way' | 'urgent' | 'noted';

interface Haven {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  type: HavenType;
  areaLabel: string;
  whenOpen: string;
  capacity: number;
  note: string;
  open: boolean;
  verified: boolean;
  verifiedCount: number;
  reportCount: number;
  isOwner: boolean;
  verifiedByMe: boolean;
  contactLine?: string;
  createdAt: number;
  updatedAt: number;
}

interface HavenAck {
  userId: string;
  userName: string;
  type: AckType;
  at: number;
}

interface RefugeEvent {
  id: string;
  havenId?: string;
  havenName?: string;
  initiatorId: string;
  initiatorName: string;
  note: string;
  areaLabel: string;
  shareLocation: boolean;
  status: RefugeStatus;
  acks: HavenAck[];
  ackCount: number;
  contactCount: number;
  reportCount: number;
  isMine: boolean;
  myAckType: AckType | null;
  canAck: boolean;
  location?: { lat: number; lng: number; accuracy?: number };
  createdAt: number;
  resolvedAt?: number;
  resolvedById?: string;
}

interface StatusOverview {
  me: { id: string; name: string };
  havenCount: number;
  verifiedHavenCount: number;
  eventCount: number;
  activeRefugeForMe: number;
  incomingAckCount: number;
  balance: number;
}

interface SafeHavenViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const HAVEN_TYPE_LABEL: Record<HavenType, string> = {
  shop: 'Shop / store', cafe: 'Cafe / restaurant', pharmacy: 'Pharmacy',
  transit: 'Transit / station', medical: 'Medical point', community: 'Community centre',
  home: 'Safe home', other: 'Other',
};

const ACK_LABEL: Record<AckType, string> = {
  on_my_way: 'On my way', urgent: 'Urgent', noted: 'Noted',
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Safe haven card
// ---------------------------------------------------------------------------

function HavenCard({
  haven, me, verifyThreshold, api, toast, onChanged,
}: {
  key?: string | number;
  haven: Haven;
  me: { id: string; name: string } | null;
  verifyThreshold: number;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    try { await fn(); onChanged(); } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setBusy(null); }
  };

  return (
    <motion.div layout className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${haven.open ? 'bg-emerald-600/10' : 'bg-zinc-200/70 dark:bg-zinc-800'}`}>
          {haven.open ? <DoorOpen className="text-emerald-600" size={16} /> : <Ban className="text-zinc-400" size={16} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">{haven.name}</h3>
            {haven.verified && (
              <span className="flex items-center gap-0.5 text-[8px] font-mono uppercase bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                <BadgeCheck size={9} /> verified
              </span>
            )}
            <span className="text-[8px] font-mono uppercase bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 px-1.5 py-0.5 rounded-full capitalize">
              {HAVEN_TYPE_LABEL[haven.type] || haven.type}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
            <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {haven.areaLabel}</span>
            {haven.whenOpen && <span className="flex items-center gap-1 normal-case"><Clock size={11} /> {haven.whenOpen}</span>}
            {haven.capacity > 0 && <span className="flex items-center gap-1 normal-case"><Users size={11} /> cap {haven.capacity}</span>}
          </div>
          {haven.note && <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-1.5">{haven.note}</p>}
          {haven.contactLine && (
            <p className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
              <Phone size={10} /> {haven.contactLine}
            </p>
          )}
          <div className="text-[10px] font-mono text-[#8a8172] dark:text-zinc-500 mt-1">
            {haven.verified ? `${haven.verifiedCount} verifications` : `${haven.verifiedCount}/${verifyThreshold} verifications needed`}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {!haven.isOwner && !haven.verifiedByMe && !haven.verified && (
          <button
            onClick={() => run('verify', () => api(`/api/safehaven/havens/${haven.id}/verify`, 'POST'))}
            disabled={busy === 'verify'}
            className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 disabled:opacity-50 flex items-center gap-1"
          >
            <ShieldCheck size={11} /> Verify
          </button>
        )}
        {haven.isOwner && (
          <>
            <button
              onClick={() => run('open', () => api(`/api/safehaven/havens/${haven.id}/open`, 'POST', { open: !haven.open }))}
              disabled={busy === 'open'}
              className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1"
            >
              <DoorOpen size={11} /> {haven.open ? 'Mark closed' : 'Mark open'}
            </button>
            <button
              onClick={() => run('delete', () => api(`/api/safehaven/havens/${haven.id}`, 'DELETE'))}
              disabled={busy === 'delete'}
              className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-transparent text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
            >
              Remove
            </button>
          </>
        )}
        {!haven.isOwner && (
          <button
            onClick={() => setReportOpen(true)}
            className="ml-auto text-[#8a8172] dark:text-zinc-500 hover:text-red-600 transition-colors"
            title="Report fake haven"
          >
            <AlertTriangle size={14} />
          </button>
        )}
      </div>

      {reportOpen && (
        <div className="mt-3 rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50/60 dark:bg-red-950/30 p-3 space-y-2">
          <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-red-700 dark:text-red-300 flex items-center gap-1">
            <AlertTriangle size={11} /> Report this haven
          </p>
          <p className="text-[10px] text-[#5c5446] dark:text-zinc-300">Fake or commercial havens are removed after 3 reports.</p>
          <div className="flex gap-2">
            <button
              onClick={() => run('report', () => api(`/api/safehaven/havens/${haven.id}/report`, 'POST', { reason: 'fake_haven' }))}
              className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Report
            </button>
            <button
              onClick={() => setReportOpen(false)}
              className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-transparent text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Refuge event card
// ---------------------------------------------------------------------------

function RefugeEventCard({
  ev, me, api, toast, onChanged,
}: {
  key?: string | number;
  ev: RefugeEvent;
  me: { id: string; name: string } | null;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    try { await fn(); onChanged(); } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setBusy(null); }
  };

  const active = ev.status === 'active';
  const statusColor =
    ev.status === 'active' ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300'
    : ev.status === 'resolved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
    : 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400';

  return (
    <motion.div layout className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${active ? 'bg-red-600 animate-pulse' : 'bg-zinc-400'}`} />
        <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1">{ev.initiatorName}</h3>
        <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full uppercase ${statusColor}`}>{ev.status}</span>
      </div>
      <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-2">{ev.note}</p>
      <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
        <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {ev.areaLabel}</span>
        {ev.havenName && <span className="flex items-center gap-1 normal-case"><House size={11} /> → {ev.havenName}</span>}
        <span className="flex items-center gap-1 normal-case"><Users size={11} /> {ev.contactCount} circle · {ev.ackCount} ack</span>
        <span className="flex items-center gap-1 normal-case"><Clock size={11} /> {timeAgo(ev.createdAt)}</span>
        {ev.shareLocation && <span className="flex items-center gap-1"><LocateFixed size={11} /> precise</span>}
      </div>

      {ev.acks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ev.acks.slice(0, 6).map(a => (
            <span key={a.userId} className="text-[9px] font-mono bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 px-1.5 py-0.5 rounded-full">
              {a.userName} · {ACK_LABEL[a.type] || a.type}
            </span>
          ))}
        </div>
      )}

      {showDetails && ev.location && (
        <div className="mt-2 rounded-lg bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 p-2 text-[10px] font-mono text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
          <Navigation size={11} /> {ev.location.lat.toFixed(5)}, {ev.location.lng.toFixed(5)}{ev.location.accuracy ? ` ±${Math.round(ev.location.accuracy)}m` : ''}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {ev.canAck && (
          <>
            <button
              onClick={() => run('ack_way', () => api(`/api/safehaven/events/${ev.id}/ack`, 'POST', { type: 'on_my_way' }))}
              disabled={busy === 'ack_way'}
              className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1"
            >
              <Navigation size={11} /> I'm coming
            </button>
            <button
              onClick={() => run('ack_urgent', () => api(`/api/safehaven/events/${ev.id}/ack`, 'POST', { type: 'urgent' }))}
              disabled={busy === 'ack_urgent'}
              className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Urgent
            </button>
            <button
              onClick={() => run('ack_noted', () => api(`/api/safehaven/events/${ev.id}/ack`, 'POST', { type: 'noted' }))}
              disabled={busy === 'ack_noted'}
              className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 disabled:opacity-50"
            >
              Noted
            </button>
          </>
        )}
        {ev.isMine && active && (
          <button
            onClick={() => run('resolve', () => api(`/api/safehaven/events/${ev.id}/resolve`, 'POST'))}
            disabled={busy === 'resolve'}
            className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-1"
          >
            <CheckCircle2 size={11} /> I'm safe
          </button>
        )}
        {!ev.isMine && (
          <button
            onClick={() => setReportOpen(true)}
            className="ml-auto text-[#8a8172] dark:text-zinc-500 hover:text-red-600 transition-colors"
            title="Report fake event"
          >
            <AlertTriangle size={14} />
          </button>
        )}
        <button
          onClick={() => setShowDetails(s => !s)}
          className="text-[#8a8172] dark:text-zinc-500 hover:text-[#3a342a] transition-colors flex items-center gap-1 text-[9px] font-mono uppercase"
        >
          {showDetails ? <EyeOff size={13} /> : <Eye size={13} />} {showDetails ? 'Hide' : 'Details'}
        </button>
      </div>

      {reportOpen && (
        <div className="mt-3 rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50/60 dark:bg-red-950/30 p-3 space-y-2">
          <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-red-700 dark:text-red-300 flex items-center gap-1">
            <AlertTriangle size={11} /> Report this refuge event
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => run('report', () => api(`/api/safehaven/events/${ev.id}/report`, 'POST', { reason: 'fake_event' }))}
              className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              Report
            </button>
            <button
              onClick={() => setReportOpen(false)}
              className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-transparent text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function SafeHavenView({ token, currentUser, onClose }: SafeHavenViewProps) {
  const [status, setStatus] = useState<StatusOverview | null>(null);
  const [havens, setHavens] = useState<Haven[]>([]);
  const [events, setEvents] = useState<RefugeEvent[]>([]);
  const [meta, setMeta] = useState<{ types: { id: string; label: string }[]; disclaimer?: string; verifyThreshold?: number; coinRewards?: Record<string, number> } | null>(null);
  const [tab, setTab] = useState<'havens' | 'refuge'>('havens');
  const [loading, setLoading] = useState(true);
  const [havenDialog, setHavenDialog] = useState(false);
  const [refugeDialog, setRefugeDialog] = useState(false);

  // Haven form
  const [havenForm, setHavenForm] = useState({
    name: '', type: 'shop' as HavenType, areaLabel: '', whenOpen: '', capacity: 0, note: '', contactLine: '', open: true,
  });
  // Refuge form
  const [refugeForm, setRefugeForm] = useState({ note: '', areaLabel: '', havenId: '' });
  const [shareLoc, setShareLoc] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const loadStatus = useCallback(async () => {
    try { setStatus(await api('/api/safehaven/status', 'GET')); } catch (e) { /* ignore */ }
  }, [token]);

  const loadHavens = useCallback(async () => {
    try {
      const data = await api('/api/safehaven/havens', 'GET');
      setHavens(data.havens || []);
    } catch (e) { /* ignore */ }
  }, [token]);

  const loadEvents = useCallback(async () => {
    try {
      const data = await api('/api/safehaven/events', 'GET');
      setEvents(data.events || []);
    } catch (e) { /* ignore */ }
  }, [token]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadStatus(), loadHavens(), loadEvents()]);
    setLoading(false);
  }, [loadStatus, loadHavens, loadEvents]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!meta) {
      api('/api/safehaven/meta', 'GET').then(setMeta).catch(() => {});
    }
  }, [token]);

  const locate = () => {
    if (!navigator.geolocation) { toast('Geolocation is not available on this device.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        setLocating(false);
        toast('Precise location captured (shared only on submit, if you opt in).');
      },
      () => {
        setLocating(false);
        toast('Could not get your location.', 'destructive');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  const createHaven = async () => {
    if (havenForm.name.trim().length < 2) return toast('A haven name is required.');
    if (havenForm.areaLabel.trim().length < 2) return toast('An approximate area is required.');
    setSaving(true);
    try {
      await api('/api/safehaven/havens', 'POST', {
        ...havenForm,
        capacity: Number(havenForm.capacity) || 0,
      });
      toast('Safe haven registered. Neighbours can now verify it.');
      setHavenDialog(false);
      setHavenForm({ name: '', type: 'shop', areaLabel: '', whenOpen: '', capacity: 0, note: '', contactLine: '', open: true });
      loadHavens(); loadStatus();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setSaving(false); }
  };

  const createRefuge = async () => {
    if (refugeForm.areaLabel.trim().length < 2) return toast('An approximate area is required.');
    if (refugeForm.note.trim().length < 3) return toast('Add a short note.');
    setSaving(true);
    try {
      await api('/api/safehaven/events', 'POST', {
        note: refugeForm.note.trim(),
        areaLabel: refugeForm.areaLabel.trim(),
        havenId: refugeForm.havenId || undefined,
        shareLocation: shareLoc,
        lat: shareLoc ? geo?.lat : undefined,
        lng: shareLoc ? geo?.lng : undefined,
        accuracy: shareLoc ? geo?.accuracy : undefined,
      });
      toast(shareLoc && geo ? 'Refuge alert sent with precise location.' : 'Refuge alert sent. Stay safe.');
      setRefugeDialog(false);
      setRefugeForm({ note: '', areaLabel: '', havenId: '' });
      setShareLoc(false);
      setGeo(null);
      loadEvents(); loadStatus();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setSaving(false); }
  };

  const pickHaven = (id: string) => {
    const h = havens.find(x => x.id === id);
    setRefugeForm(f => ({
      ...f,
      havenId: id,
      areaLabel: !f.areaLabel.trim() && h ? h.areaLabel : f.areaLabel,
    }));
  };

  const inputCls = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400';

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-amber-600/10 flex items-center justify-center">
              <House className="text-amber-700 dark:text-amber-400" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">SafeHaven</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                Safe places · refuge alerts · civic resilience
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/50 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Status strip */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <HeartHandshake className="mx-auto text-amber-600" size={15} />
            <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.balance ?? '—'}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">safety coins</div>
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <ShieldCheck className="mx-auto text-emerald-600" size={15} />
            <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.verifiedHavenCount ?? 0}<span className="text-[#8a8172]">/{status?.havenCount ?? 0}</span></div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">verified havens</div>
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <Siren className={`mx-auto text-rose-600 ${(status?.activeRefugeForMe || 0) > 0 ? 'animate-pulse' : ''}`} size={15} />
            <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.activeRefugeForMe ?? 0}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">refuge for me</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {([['havens', 'Safe havens'], ['refuge', 'Refuge alerts']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
                tab === k
                  ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
                  : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl p-3">
          {meta?.disclaimer || 'A community network of verified refuges. A place is shown by approximate area only — exact addresses are never stored. If you are in immediate danger, call your local emergency number first.'}
        </p>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setHavenDialog(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
          >
            <Plus size={12} /> Register a haven
          </button>
          <button
            onClick={() => setRefugeDialog(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-mono uppercase font-bold"
          >
            <Siren size={12} /> I'm seeking refuge
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading…</div>
        ) : tab === 'havens' ? (
          havens.length === 0 ? (
            <div className="py-14 text-center space-y-2">
              <House className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
              <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No safe havens registered yet.</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Register a shop, cafe or home as a refuge</p>
            </div>
          ) : (
            <div className="space-y-3">
              {havens.map(h => (
                <HavenCard key={h.id} haven={h} me={currentUser} verifyThreshold={meta?.verifyThreshold ?? 3} api={api} toast={toast} onChanged={() => { loadHavens(); loadStatus(); }} />
              ))}
            </div>
          )
        ) : (
          events.length === 0 ? (
            <div className="py-14 text-center space-y-2">
              <HeartHandshake className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
              <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No refuge alerts for you right now.</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Events from your safety circle appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map(ev => (
                <RefugeEventCard key={ev.id} ev={ev} me={currentUser} api={api} toast={toast} onChanged={() => { loadEvents(); loadStatus(); }} />
              ))}
            </div>
          )
        )}
      </div>

      {/* Register a safe haven dialog */}
      <AnimatePresence>
        {havenDialog && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setHavenDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <House className="text-amber-700" size={16} /> Register a Safe Haven
                </h3>
                <button onClick={() => setHavenDialog(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>

              <input
                value={havenForm.name} onChange={e => setHavenForm({ ...havenForm, name: e.target.value })}
                placeholder="Place name (e.g. Rahim's grocery)"
                className={inputCls}
              />
              <input
                value={havenForm.areaLabel} onChange={e => setHavenForm({ ...havenForm, areaLabel: e.target.value })}
                placeholder="Approximate area (e.g. North Beach, near the mosque)"
                className={inputCls}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={havenForm.type} onChange={e => setHavenForm({ ...havenForm, type: e.target.value as HavenType })}
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm"
                >
                  {(meta?.types?.length ? meta.types : Object.entries(HAVEN_TYPE_LABEL).map(([id, label]) => ({ id, label }))).map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <input
                  value={havenForm.whenOpen} onChange={e => setHavenForm({ ...havenForm, whenOpen: e.target.value })}
                  placeholder="Open hours (e.g. 7am–11pm)"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number" value={havenForm.capacity || ''}
                  onChange={e => setHavenForm({ ...havenForm, capacity: Number(e.target.value) })}
                  placeholder="Capacity (optional)"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
                <label className="flex items-center gap-2 text-xs text-[#5c5446] dark:text-zinc-300 px-1">
                  <input type="checkbox" checked={havenForm.open} onChange={e => setHavenForm({ ...havenForm, open: e.target.checked })} className="accent-amber-700" />
                  Currently open
                </label>
              </div>
              <textarea
                value={havenForm.note} onChange={e => setHavenForm({ ...havenForm, note: e.target.value })}
                placeholder="What refuge can you offer? (e.g. water, a seat, first aid)"
                rows={2}
                className={inputCls + ' resize-none'}
              />
              <input
                value={havenForm.contactLine} onChange={e => setHavenForm({ ...havenForm, contactLine: e.target.value })}
                placeholder="Contact line (optional, e.g. @username — shown only to people seeking refuge here)"
                className={inputCls}
              />

              <button
                onClick={createHaven} disabled={saving}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
              >
                <Plus size={12} /> {saving ? 'Registering…' : 'Register haven'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seeking refuge dialog */}
      <AnimatePresence>
        {refugeDialog && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setRefugeDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <Siren className="text-rose-600" size={16} /> I'm seeking refuge
                </h3>
                <button onClick={() => setRefugeDialog(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>

              <textarea
                value={refugeForm.note} onChange={e => setRefugeForm({ ...refugeForm, note: e.target.value })}
                placeholder="Where are you and what do you need? (e.g. walking home, rain flooding, need to wait)"
                rows={3}
                className={inputCls + ' resize-none'}
              />
              <input
                value={refugeForm.areaLabel} onChange={e => setRefugeForm({ ...refugeForm, areaLabel: e.target.value })}
                placeholder="Approximate area (e.g. near the north market)"
                className={inputCls}
              />
              {havens.length > 0 && (
                <select
                  value={refugeForm.havenId}
                  onChange={e => pickHaven(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">Heading to a safe haven… (optional)</option>
                  {havens.filter(h => h.open).map(h => (
                    <option key={h.id} value={h.id}>{h.name} · {h.areaLabel}</option>
                  ))}
                </select>
              )}

              <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs text-[#5c5446] dark:text-zinc-300">
                  <input type="checkbox" checked={shareLoc} onChange={e => setShareLoc(e.target.checked)} className="accent-rose-600" />
                  Share precise location
                </label>
                <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 leading-relaxed">
                  Only included if you opt in. Revealed to responders who acknowledge and the haven operator — never to the general feed.
                </p>
                {shareLoc && (
                  <button
                    onClick={locate} disabled={locating}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
                  >
                    <LocateFixed size={12} /> {locating ? 'Locating…' : geo ? 'Recapture location' : 'Capture my location'}
                  </button>
                )}
                {geo && (
                  <p className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                    {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}{geo.accuracy ? ` ±${Math.round(geo.accuracy)}m` : ''}
                  </p>
                )}
              </div>

              <button
                onClick={createRefuge} disabled={saving}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-mono uppercase font-bold disabled:opacity-50"
              >
                <Siren size={12} /> {saving ? 'Sending…' : 'Send refuge alert'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
