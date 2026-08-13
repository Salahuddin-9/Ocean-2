import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Siren, ShieldAlert, ShieldCheck, MapPin, Users, Plus, X, HeartHandshake,
  Timer, CheckCircle2, AlertTriangle, PhoneCall, LocateFixed, Trash2,
  Coins, UserPlus, Save, Clock, ChevronDown, MessageSquare,
} from 'lucide-react';

/**
 * Ocean — Safety Shield (Personal SOS + Trusted Circle)
 * -----------------------------------------------------
 * Extends the emergency UX (EmergencyView covers community pools; this covers
 * the individual): one-tap SOS broadcast to a user's trusted circle, check-in
 * safe-walk timers that auto-escalate, emergency contacts, an emergency
 * medical profile, and safety-coin rewards. Backed by /api/safety/*.
 *
 * Privacy: precise location is ONLY sent when the user explicitly toggles
 * "share my location" on the alert. Home address is only ever shown to
 * responders who acknowledged an opted-in alert.
 */

type EventKind = 'sos' | 'checkin';
type EventStatus = 'active' | 'pending' | 'resolved' | 'expired';

interface Contact {
  id: string;
  ownerId: string;
  userId: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  addedAt: number;
}

interface Acknowledger {
  id: string;
  name: string;
  note?: string;
  at: number;
}

interface SafetyEvent {
  id: string;
  kind: EventKind;
  status: EventStatus;
  userId: string;
  userName: string;
  userAvatar?: string;
  message: string;
  locationLabel?: string;
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  createdAt: number;
  expiresAt: number;
  confirmBy?: number;
  escalated?: boolean;
  escalatedAt?: number;
  acknowledgedBy: Acknowledger[];
  resolvedBy?: { id: string; name: string; at: number };
  resolvedAt?: number;
  // client-added flags
  isMine?: boolean;
  canRespond?: boolean;
  acknowledgedByMe?: boolean;
}

interface SafetyProfile {
  userId: string;
  note?: string;
  bloodType?: string;
  allergies?: string;
  addressLabel?: string;
  updatedAt: number;
}

interface SearchResult {
  id: string;
  name: string;
  username?: string;
  avatarUrl?: string;
}

interface SafetyShieldViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const SOS_BUTTON =
  'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-500 disabled:opacity-50 transition-all';
const CHECKIN_BUTTON =
  'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-amber-600 disabled:opacity-50 transition-all';
const PRIMARY_BUTTON =
  'flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50 transition-all';
const SECONDARY_BUTTON =
  'bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-[#3a342a] dark:text-zinc-200';
const CARD =
  'bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3 shadow-sm';
const INPUT =
  'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400';

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtCoords(lat?: number, lng?: number): string {
  if (lat == null || lng == null) return '';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not available on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.message || 'Could not get your location.')),
      { timeout: 8000, maximumAge: 30000 }
    );
  });
}

// ---------------------------------------------------------------------------
// Countdown for a pending check-in timer
// ---------------------------------------------------------------------------

function Countdown({ confirmBy }: { confirmBy: number }) {
  const [left, setLeft] = useState(Math.max(0, Math.ceil((confirmBy - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((confirmBy - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [confirmBy]);
  const m = Math.floor(left / 60);
  const s = left % 60;
  const urgent = left <= 60;
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold ${urgent ? 'text-rose-600 animate-pulse' : 'text-amber-800 dark:text-amber-400'}`}>
      <Timer size={11} /> {m}:{String(s).padStart(2, '0')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Event card
// ---------------------------------------------------------------------------

function EventCard({
  ev, me, api, toast, onChanged,
}: {
  key?: string | number;
  ev: SafetyEvent;
  me: { id: string; name: string } | null;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [ackNote, setAckNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<{ event?: SafetyEvent; creatorProfile?: SafetyProfile } | null>(null);

  const isSos = ev.kind === 'sos';
  const isMine = ev.isMine || ev.userId === me?.id;
  const live = ev.status === 'active' || ev.status === 'pending';
  const allowAck = !!ev.canRespond && live && !ev.acknowledgedByMe;

  const loadDetail = async () => {
    try {
      const data = await api(`/api/safety/events/${ev.id}`, 'GET');
      setDetail(data);
    } catch (e) {
      /* ignore */
    }
  };

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) loadDetail();
  };

  const acknowledge = async () => {
    setBusy(true);
    try {
      const data = await api(`/api/safety/events/${ev.id}/acknowledge`, 'POST', { note: ackNote.trim() });
      toast('You acknowledged the alert. Safety coins +15.');
      if (data.coins != null) toast(`Safety coins: ${data.coins}`, 'balance');
      setAckNote('');
      setExpanded(true);
      loadDetail();
      onChanged();
    } catch (e: any) {
      toast(e.message, 'destructive');
    } finally {
      setBusy(false);
    }
  };

  const resolve = async () => {
    setBusy(true);
    try {
      const data = await api(`/api/safety/events/${ev.id}/resolve`, 'POST');
      toast(ev.kind === 'checkin' && !ev.escalated ? 'Check-in confirmed — you are safe. +10 coins.' : 'Alert resolved. Thank you.');
      if (data.coins != null && data.coins > 0) toast(`Safety coins: ${data.coins}`, 'balance');
      onChanged();
    } catch (e: any) {
      toast(e.message, 'destructive');
    } finally {
      setBusy(false);
    }
  };

  const showCoords =
    detail?.event?.shareLocation || (ev.shareLocation && (isMine || ev.acknowledgedByMe));
  const lat = detail?.event?.lat ?? ev.lat;
  const lng = detail?.event?.lng ?? ev.lng;

  return (
    <motion.div layout className={`rounded-2xl border p-4 shadow-sm ${isSos ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20' : 'border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70'}`}>
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${isSos ? 'bg-rose-600' : 'bg-amber-400'} ${live && isSos ? 'animate-pulse' : ''}`} />
        <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1">
          {isSos ? (ev.escalated ? 'Escalated SOS' : 'SOS Alert') : 'Check-in'}
          {isMine && <span className="ml-1 font-mono text-[8px] text-[#8a8172]">(you)</span>}
        </h3>
        <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full capitalize ${ev.status === 'active' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' : ev.status === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-[#ebdcca]/50 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400'}`}>
          {ev.status}
        </span>
      </div>

      <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-2">
        <span className="font-semibold">{ev.userName}</span>
        {ev.message ? ` — ${ev.message}` : ''}
      </p>

      <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
        <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(ev.createdAt)}</span>
        {ev.locationLabel && <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {ev.locationLabel}</span>}
        {showCoords && lat != null && lng != null && (
          <span className="flex items-center gap-1 normal-case text-rose-600 dark:text-rose-400"><LocateFixed size={11} /> {fmtCoords(lat, lng)}</span>
        )}
        {ev.kind === 'checkin' && ev.status === 'pending' && ev.confirmBy && (
          <Countdown confirmBy={ev.confirmBy} />
        )}
        {ev.escalated && (
          <span className="flex items-center gap-1 normal-case text-rose-600 dark:text-rose-400"><AlertTriangle size={11} /> Escalated — check-in missed</span>
        )}
        <span className="flex items-center gap-1"><Users size={11} /> {ev.acknowledgedBy?.length || 0} responding</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {allowAck && (
          <>
            <input
              value={ackNote} onChange={(e) => setAckNote(e.target.value)}
              placeholder="Note for them (optional)"
              className="flex-1 min-w-[120px] bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-rose-400"
            />
            <button onClick={acknowledge} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-500 disabled:opacity-50 transition-all">
              <PhoneCall size={12} /> I'm on my way
            </button>
          </>
        )}
        {isMine && live && (
          <button onClick={resolve} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-emerald-600 disabled:opacity-50 transition-all">
            <CheckCircle2 size={12} /> {ev.kind === 'checkin' ? 'Confirm I am safe' : 'I am safe'}
          </button>
        )}
        {isMine && !live && ev.status === 'resolved' && (
          <span className="flex items-center gap-1 font-mono text-[9px] uppercase text-emerald-600"><CheckCircle2 size={11} /> Resolved</span>
        )}
        {ev.acknowledgedByMe && live && !isMine && (
          <button onClick={resolve} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-emerald-600 disabled:opacity-50 transition-all">
            <CheckCircle2 size={12} /> Mark resolved
          </button>
        )}
        <button onClick={toggleExpand} className={`ml-auto ${expanded ? 'text-[#5c5446]' : 'text-[#8a8172]'} hover:text-[#3a342a] flex items-center gap-1 font-mono text-[9px] uppercase`}>
          {expanded ? 'Hide' : 'Details'} <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 border-t border-[#ebdcca]/60 dark:border-zinc-800 pt-3 space-y-2">
          {ev.acknowledgedBy?.length > 0 && (
            <div className="text-xs text-[#5c5446] dark:text-zinc-300">
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] mb-1 flex items-center gap-1"><HeartHandshake size={11} /> Responders</div>
              {ev.acknowledgedBy.map((a) => (
                <div key={a.id} className="flex items-baseline gap-2 py-0.5">
                  <span className="font-semibold text-[#3a342a] dark:text-zinc-100">{a.name}</span>
                  <span className="text-[10px] text-[#8a8172]">{timeAgo(a.at)}</span>
                  {a.note && <span className="text-xs italic">“{a.note}”</span>}
                </div>
              ))}
            </div>
          )}

          {/* Creator emergency info revealed to acknowledged responders / self */}
          {((isMine || ev.acknowledgedByMe) && (detail?.creatorProfile || ev.userAvatar)) && (
            <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 text-xs space-y-1">
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] flex items-center gap-1"><ShieldCheck size={11} /> Emergency info</div>
              {detail?.creatorProfile?.bloodType && <p><b>Blood:</b> {detail.creatorProfile.bloodType}</p>}
              {detail?.creatorProfile?.allergies && <p><b>Allergies:</b> {detail.creatorProfile.allergies}</p>}
              {detail?.creatorProfile?.note && <p><b>Note:</b> {detail.creatorProfile.note}</p>}
              {detail?.creatorProfile?.addressLabel && showCoords && <p><b>Address:</b> {detail.creatorProfile.addressLabel}</p>}
              {!detail?.creatorProfile?.bloodType && !detail?.creatorProfile?.allergies && !detail?.creatorProfile?.note && (
                <p className="text-[10px] text-[#8a8172]">No medical profile set.</p>
              )}
              {detail?.creatorProfile?.addressLabel && !showCoords && (
                <p className="text-[10px] text-[#8a8172]">Address hidden — only shared when the sender opts into location.</p>
              )}
            </div>
          )}

          {ev.message && (
            <div className="text-[11px] text-[#5c5446] dark:text-zinc-300 flex items-start gap-1">
              <MessageSquare size={11} className="mt-0.5 shrink-0 text-[#8a8172]" /> {ev.message}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function SafetyShieldView({ token, currentUser, onClose }: SafetyShieldViewProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [events, setEvents] = useState<SafetyEvent[]>([]);
  const [profile, setProfile] = useState<SafetyProfile | null>(null);
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);

  const [panicOpen, setPanicOpen] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);

  // Panic / check-in form
  const [form, setForm] = useState({
    message: '',
    locationLabel: '',
    shareLocation: false,
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    locating: false,
  });
  const [confirmInMin, setConfirmInMin] = useState(15);

  // Contact add
  const [username, setUsername] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [addBusy, setAddBusy] = useState(false);

  // Profile form
  const [pForm, setPForm] = useState({ note: '', bloodType: '', allergies: '', addressLabel: '' });
  const [pEditing, setPEditing] = useState(false);
  const [pBusy, setPBusy] = useState(false);

  const [scope, setScope] = useState<'active' | 'all' | 'mine'>('active');

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  const api = async (path: string, method = 'GET', body?: unknown) => {
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

  const loadAll = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const [st, ev] = await Promise.all([
        api('/api/safety/status', 'GET'),
        api('/api/safety/events?scope=active', 'GET'),
      ]);
      setContacts(st.contacts || []);
      setSuggestions(st.friendSuggestions || []);
      setProfile(st.profile || null);
      setCoins(st.coins || 0);
      setPForm({
        note: st.profile?.note || '',
        bloodType: st.profile?.bloodType || '',
        allergies: st.profile?.allergies || '',
        addressLabel: st.profile?.addressLabel || '',
      });
      setEvents(ev.events || []);
    } catch (e) {
      console.error('Failed to load safety shield:', e);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ---- Location opt-in helper (only fires when the user toggles share) ----
  const enableLocation = async () => {
    setForm((f) => ({ ...f, locating: true }));
    try {
      const pos = await getPosition();
      setForm((f) => ({ ...f, lat: pos.lat, lng: pos.lng, locating: false }));
      toast('Location acquired — will be shared with this alert only.');
    } catch (e: any) {
      setForm((f) => ({ ...f, shareLocation: false, locating: false, lat: undefined, lng: undefined }));
      toast(e.message || 'Could not get location. You can still send without it.', 'destructive');
    }
  };

  const sendAlert = async (kind: 'sos' | 'checkin') => {
    if (!token) return toast('Sign in to use Safety Shield.');
    setAddBusy(true);
    try {
      await api('/api/safety/events', 'POST', {
        kind,
        message: form.message.trim(),
        locationLabel: form.locationLabel.trim(),
        shareLocation: form.shareLocation,
        lat: form.lat,
        lng: form.lng,
        confirmInMin: kind === 'checkin' ? confirmInMin : undefined,
      });
      toast(kind === 'sos' ? 'SOS broadcast to your trusted circle.' : `Check-in set — you have ${confirmInMin} min to confirm.`);
      setPanicOpen(false);
      setCheckinOpen(false);
      setForm({ message: '', locationLabel: '', shareLocation: false, lat: undefined, lng: undefined, locating: false });
      loadAll();
    } catch (e: any) {
      toast(e.message, 'destructive');
    } finally {
      setAddBusy(false);
    }
  };

  const reloadEvents = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api(`/api/safety/events?scope=${scope}`, 'GET');
      setEvents(data.events || []);
      const st = await api('/api/safety/status', 'GET');
      setCoins(st.coins || 0);
    } catch (e) { /* ignore */ }
  }, [token, scope]);

  const addContact = async (target: { userId?: string; username?: string }) => {
    if (!token) return;
    setAddBusy(true);
    try {
      const data = await api('/api/safety/contacts', 'POST', target);
      toast('Added to your trusted circle.');
      if (data.coins != null && data.coins > 0) toast(`Welcome kit: ${data.coins} safety coins`, 'balance');
      setUsername('');
      setSearchResults([]);
      loadAll();
    } catch (e: any) {
      toast(e.message, 'destructive');
    } finally {
      setAddBusy(false);
    }
  };

  const removeContact = async (userId: string) => {
    if (!token) return;
    try {
      await api(`/api/safety/contacts/${userId}`, 'DELETE');
      toast('Contact removed.');
      loadAll();
    } catch (e: any) {
      toast(e.message, 'destructive');
    }
  };

  const searchUsers = async (q: string) => {
    if (!token || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const data = await api('/api/safety/search', 'POST', { q: q.trim() });
      setSearchResults(data.results || []);
    } catch (e) { /* ignore */ }
  };

  const saveProfile = async () => {
    if (!token) return;
    setPBusy(true);
    try {
      const data = await api('/api/safety/profile', 'POST', {
        note: pForm.note,
        bloodType: pForm.bloodType,
        allergies: pForm.allergies,
        addressLabel: pForm.addressLabel,
      });
      setProfile(data.profile || null);
      setPEditing(false);
      toast('Emergency profile saved. Shown only to responders of opted-in alerts.');
    } catch (e: any) {
      toast(e.message, 'destructive');
    } finally {
      setPBusy(false);
    }
  };

  if (!token || !currentUser) {
    return (
      <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4">
        <div className="max-w-xl mx-auto">
          <div className={CARD}>
            <div className="flex items-center gap-2">
              <span className="w-9 h-9 rounded-full bg-rose-600/10 flex items-center justify-center"><Siren className="text-rose-600" size={18} /></span>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Safety Shield</h2>
            </div>
            <p className="text-sm text-[#5c5446] dark:text-zinc-300">Please sign in to set up your trusted circle and use SOS alerts.</p>
            <button onClick={onClose} className={PRIMARY_BUTTON}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[115] bg-[#f6f1e7]/95 dark:bg-zinc-950/95 backdrop-blur-sm overflow-y-auto py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-rose-600/10 flex items-center justify-center">
              <Siren className="text-rose-600" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Safety Shield</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Personal SOS · trusted circle · check-ins</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 flex items-center justify-center text-[#8a8172] hover:text-[#3a342a]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Status hero */}
        <div className={CARD}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#3a342a] dark:text-zinc-100">
              <ShieldCheck size={16} className="text-emerald-600" />
              <span className="font-display font-bold">My Safety Status</span>
            </div>
            <span className="flex items-center gap-1 font-mono text-[10px] font-bold text-[#5c5446] dark:text-zinc-300 bg-[#ebdcca]/40 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
              <Coins size={12} className="text-amber-600" /> {coins} safety coins
            </span>
          </div>
          <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
            Your trusted circle is alerted only when you press SOS or a check-in
            lapses. Location is shared only when you opt in — per alert.
          </p>

          {/* Big actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              onClick={() => setPanicOpen(true)}
              className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-rose-600 text-white font-mono text-sm uppercase font-bold tracking-wider hover:bg-rose-500 shadow-lg shadow-rose-600/20 transition-all animate-pulse"
            >
              <Siren size={18} /> Send SOS
            </button>
            <button
              onClick={() => setCheckinOpen(true)}
              className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-amber-700 text-white font-mono text-sm uppercase font-bold tracking-wider hover:bg-amber-600 shadow-lg shadow-amber-700/20 transition-all"
            >
              <Timer size={18} /> Start check-in
            </button>
          </div>
          <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172]">
            {contacts.length} trusted contact{contacts.length === 1 ? '' : 's'} · {events.filter(e => (e.status === 'active' || e.status === 'pending')).length} active alert{events.filter(e => (e.status === 'active' || e.status === 'pending')).length === 1 ? '' : 's'}
          </p>
        </div>

        {/* Trusted circle */}
        <div className={CARD}>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[#3a342a] dark:text-zinc-100" />
            <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100">Trusted Circle</h3>
          </div>
          <p className="text-xs text-[#5c5446] dark:text-zinc-300">
            These people receive your SOS and can see alert details. Add them here — they are never auto-added.
          </p>

          {contacts.length > 0 && (
            <div className="space-y-2">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-2.5">
                  {c.avatarUrl ? (
                    <img src={c.avatarUrl} alt={c.name} className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-[#ebdcca] dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-[#5c5446]">
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#3a342a] dark:text-zinc-100 truncate">{c.name}</p>
                    {c.username && <p className="text-[10px] text-[#8a8172] truncate">@{c.username}</p>}
                  </div>
                  <button
                    onClick={() => removeContact(c.userId)}
                    className="text-[#8a8172] hover:text-rose-600 transition-colors"
                    title="Remove contact"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add by username */}
          <div className="flex gap-2">
            <input
              value={username}
              onChange={(e) => { setUsername(e.target.value); searchUsers(e.target.value); }}
              placeholder="Find by name or username…"
              className={INPUT}
            />
            <button
              onClick={() => { if (username.trim()) addContact({ username: username.trim() }); }}
              disabled={addBusy || username.trim().length < 2}
              className={PRIMARY_BUTTON}
            >
              <UserPlus size={12} /> Add
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-2 space-y-1">
              {searchResults.map((r) => (
                <div key={r.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[#ebdcca]/30 dark:hover:bg-zinc-800">
                  <span className="text-sm font-semibold text-[#3a342a] dark:text-zinc-100 flex-1">{r.name}</span>
                  {r.username && <span className="text-[10px] text-[#8a8172]">@{r.username}</span>}
                  <button onClick={() => addContact({ userId: r.id })} className={SECONDARY_BUTTON + ' rounded-lg px-2 py-1 text-[10px] flex items-center gap-1'}>
                    <Plus size={11} /> Add
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Friend quick-picks */}
          {suggestions.length > 0 && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] mb-1">Quick add from friends</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => addContact({ userId: f.id })}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 text-[10px] text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 transition-colors"
                  >
                    <Plus size={10} /> {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Emergency profile */}
        <div className={CARD}>
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
              <ShieldAlert size={16} /> Emergency Profile
            </h3>
            <button
              onClick={() => setPEditing((v) => !v)}
              className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 px-2 py-1 rounded-lg border border-[#ebdcca] dark:border-zinc-700 hover:bg-[#ebdcca]/30"
            >
              {pEditing ? 'Cancel' : 'Edit'}
            </button>
          </div>
          {!pEditing ? (
            <div className="text-xs text-[#5c5446] dark:text-zinc-300 space-y-1">
              {profile?.bloodType ? <p><b>Blood type:</b> {profile.bloodType}</p> : <p className="text-[#8a8172]">No blood type set.</p>}
              {profile?.allergies ? <p><b>Allergies:</b> {profile.allergies}</p> : <p className="text-[#8a8172]">No allergies listed.</p>}
              {profile?.note ? <p><b>Medical note:</b> {profile.note}</p> : <p className="text-[#8a8172]">No medical note.</p>}
              {profile?.addressLabel ? <p><b>Home address label:</b> {profile.addressLabel}</p> : <p className="text-[#8a8172]">No address saved.</p>}
              <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] pt-1">
                Shown only to responders of alerts where you opted into location sharing.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={pForm.bloodType} onChange={(e) => setPForm({ ...pForm, bloodType: e.target.value })} placeholder="Blood type (e.g. B+)" className={INPUT} />
                <input value={pForm.allergies} onChange={(e) => setPForm({ ...pForm, allergies: e.target.value })} placeholder="Allergies" className={INPUT} />
              </div>
              <input value={pForm.note} onChange={(e) => setPForm({ ...pForm, note: e.target.value })} placeholder="Medical note (meds, conditions…)" className={INPUT} />
              <input value={pForm.addressLabel} onChange={(e) => setPForm({ ...pForm, addressLabel: e.target.value })} placeholder="Home address label (e.g. 12 Lakeview Rd)" className={INPUT} />
              <button onClick={saveProfile} disabled={pBusy} className={PRIMARY_BUTTON}>
                <Save size={12} /> {pBusy ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          )}
        </div>

        {/* Alerts feed */}
        <div className={CARD}>
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600" /> Alerts
            </h3>
            <div className="flex gap-1">
              {([['active', 'Live'], ['mine', 'Mine'], ['all', 'History']] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setScope(k)}
                  className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-2.5 rounded-full transition-all ${
                    scope === k
                      ? 'bg-[#3a342a] text-[#f4f1ea] dark:bg-zinc-200 dark:text-zinc-900'
                      : 'bg-[#ebdcca]/40 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/70'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172]">Loading alerts…</div>
          ) : events.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <HeartHandshake className="mx-auto text-[#8a8172]" size={26} />
              <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No alerts right now.</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">Press SOS or start a check-in</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => (
                <EventCard key={ev.id} ev={ev} me={currentUser} api={api} toast={toast} onChanged={reloadEvents} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Panic modal */}
      <AnimatePresence>
        {panicOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPanicOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-rose-200 dark:border-rose-900/60 space-y-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2">
                  <Siren size={16} /> Send SOS Alert
                </h3>
                <button onClick={() => setPanicOpen(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>
              <p className="text-xs text-[#5c5446] dark:text-zinc-300">
                This broadcasts an SOS to your trusted circle ({contacts.length} contact{contacts.length === 1 ? '' : 's'}).
              </p>
              <input
                value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="What's happening? (optional)"
                className={INPUT}
              />
              <input
                value={form.locationLabel} onChange={(e) => setForm({ ...form, locationLabel: e.target.value })}
                placeholder="Area you're in (e.g. near Central Market)"
                className={INPUT}
              />

              {/* Location opt-in */}
              <label className="flex items-start gap-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.shareLocation}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setForm((f) => ({ ...f, shareLocation: on }));
                    if (on && form.lat == null) enableLocation();
                  }}
                  className="mt-0.5 accent-rose-600"
                />
                <span className="text-xs text-[#5c5446] dark:text-zinc-300">
                  <b className="text-[#3a342a] dark:text-zinc-100">Share precise location</b> — opt-in per alert.
                  {form.lat != null && form.lng != null ? (
                    <span className="block font-mono text-[10px] text-rose-600 mt-0.5"><LocateFixed size={10} className="inline" /> {fmtCoords(form.lat, form.lng)}</span>
                  ) : form.locating ? (
                    <span className="block font-mono text-[10px] text-[#8a8172] mt-0.5">Locating…</span>
                  ) : (
                    <span className="block font-mono text-[9px] text-[#8a8172] mt-0.5">Not shared — a responder must acknowledge to see it.</span>
                  )}
                </span>
              </label>

              <button
                onClick={() => sendAlert('sos')}
                disabled={addBusy}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 text-white font-mono text-xs uppercase font-bold tracking-wider hover:bg-rose-500 disabled:opacity-50 transition-all"
              >
                <Siren size={14} /> {addBusy ? 'Sending…' : 'Send SOS now'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Check-in modal */}
      <AnimatePresence>
        {checkinOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setCheckinOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <Timer size={16} /> Start Check-in
                </h3>
                <button onClick={() => setCheckinOpen(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>
              <p className="text-xs text-[#5c5446] dark:text-zinc-300">
                Tell your circle you're walking home. If you don't confirm before the timer ends, it auto-escalates to an SOS.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#8a8172]">Confirm in</label>
                <select
                  value={confirmInMin}
                  onChange={(e) => setConfirmInMin(Number(e.target.value))}
                  className={INPUT}
                >
                  {[5, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
              <input
                value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Where are you headed? (optional)"
                className={INPUT}
              />
              <input
                value={form.locationLabel} onChange={(e) => setForm({ ...form, locationLabel: e.target.value })}
                placeholder="Route / area (e.g. from office to Lakeview)"
                className={INPUT}
              />
              <label className="flex items-start gap-2 rounded-xl border border-[#ebdcca] dark:border-zinc-700 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.shareLocation}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setForm((f) => ({ ...f, shareLocation: on }));
                    if (on && form.lat == null) enableLocation();
                  }}
                  className="mt-0.5 accent-amber-600"
                />
                <span className="text-xs text-[#5c5446] dark:text-zinc-300">
                  <b className="text-[#3a342a] dark:text-zinc-100">Share precise location</b> with responders
                  {form.lat != null && form.lng != null && <span className="block font-mono text-[10px] text-amber-700 mt-0.5"><LocateFixed size={10} className="inline" /> {fmtCoords(form.lat, form.lng)}</span>}
                </span>
              </label>
              <button
                onClick={() => sendAlert('checkin')}
                disabled={addBusy}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-700 text-white font-mono text-xs uppercase font-bold tracking-wider hover:bg-amber-600 disabled:opacity-50 transition-all"
              >
                <Timer size={14} /> {addBusy ? 'Starting…' : 'Start check-in'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
