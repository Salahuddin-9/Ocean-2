import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Siren, X, MapPin, Users, HeartHandshake, ShieldAlert, Clock, LocateFixed,
  UserPlus, Trash2, LifeBuoy, Footprints, Timer, CheckCheck, CheckCircle2,
  AlertTriangle, Send, ShieldCheck, Navigation, Plus,
} from 'lucide-react';

/**
 * Ocean — SafeSOS (Safety Circle)
 * --------------------------------
 * A privacy-first personal safety layer that extends the Emergency UX:
 *  - Circle: emergency contacts (stored only after the user adds them; a user
 *    can drop any link created to them).
 *  - SOS: one-tap panic alert broadcast to the circle. Fuzzy location label is
 *    always shared; precise GPS is attached ONLY if the user opts in on that tap.
 *  - Safe Walk: "walking home alone — if I don't check in by <time>, check on me."
 *  - Safety coins: earn coins for acknowledging others' SOS and for safe check-ins.
 *
 * Backed by /api/safesos/* (turtleSafeSOSBackend.ts).
 */

type Kind = 'sos' | 'checkin' | 'walk';
type Status = 'active' | 'overdue' | 'resolved';
type AckType = 'on_my_way' | 'urgent' | 'noted';

interface SafeContact {
  id: string;
  userId: string;
  name: string;
  username?: string;
  relationship: string;
  addedById: string;
  addedByName?: string;
  createdAt: number;
}

interface SOSAck {
  userId: string;
  userName: string;
  type: AckType;
  at: number;
}

interface SOSEvent {
  id: string;
  kind: Kind;
  initiatorId: string;
  initiatorName: string;
  note: string;
  locationLabel?: string;
  location?: { lat: number; lng: number; accuracy?: number };
  status: Status;
  contactIds: string[];
  acks: SOSAck[];
  reports?: { reason: string; at: number }[];
  createdAt: number;
  resolvedAt?: number;
  resolvedById?: string;
  checkinDue?: number;
  lastCheckinAt?: number;
  checkinCount?: number;
  windowMinutes?: number;
}

interface SafetyStatus {
  me: { id: string; name: string };
  contactCount: number;
  incomingCount: number;
  activeSosCount: number;
  activeWalk: SOSEvent | null;
  lastCheckinAt: number | null;
  checkinsToday: number;
  balance: number;
}

interface SafeSOSViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const RELATIONSHIPS = [
  { id: 'family', label: 'Family' },
  { id: 'friend', label: 'Friend' },
  { id: 'neighbor', label: 'Neighbor' },
  { id: 'colleague', label: 'Colleague' },
  { id: 'other', label: 'Other' },
];

const ACK_LABEL: Record<AckType, string> = {
  on_my_way: 'On my way',
  urgent: 'Urgent',
  noted: 'Noted',
};

const ACK_OPTIONS: { type: AckType; label: string; cls: string }[] = [
  { type: 'on_my_way', label: 'On my way', cls: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  { type: 'urgent', label: 'Urgent', cls: 'bg-rose-600 text-white hover:bg-rose-700' },
  { type: 'noted', label: 'Noted', cls: 'bg-[#ebdcca]/50 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/80' },
];

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function timeLeft(ts?: number): string {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((ts - Date.now()) / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function formatTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string): string {
  return (name || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
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

export default function SafeSOSView({ token, currentUser, onClose }: SafeSOSViewProps) {
  const [tab, setTab] = useState<'circle' | 'sos' | 'walk'>('sos');
  const [status, setStatus] = useState<SafetyStatus | null>(null);
  const [contacts, setContacts] = useState<SafeContact[]>([]);
  const [incoming, setIncoming] = useState<SafeContact[]>([]);
  const [events, setEvents] = useState<SOSEvent[]>([]);
  const [evFilter, setEvFilter] = useState<'all' | 'active' | 'mine'>('all');

  const [contactForm, setContactForm] = useState({ name: '', relationship: 'friend' });
  const [sosForm, setSosForm] = useState({ note: '', locationLabel: '', includeLocation: false });
  const [walkForm, setWalkForm] = useState({ minutes: 30, note: '', locationLabel: '', includeLocation: false });
  const [sending, setSending] = useState(false);

  const toast = (msg: string, variant?: string) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message: msg, variant } }));
  };

  const api = useCallback(async (path: string, method = 'GET', body?: unknown) => {
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
  }, [token]);

  const loadStatus = useCallback(async () => {
    try {
      const data = await api('/api/safesos/status', 'GET');
      setStatus(data);
    } catch (e) { /* keep last */ }
  }, [api]);

  const loadContacts = useCallback(async () => {
    try {
      const data = await api('/api/safesos/contacts', 'GET');
      setContacts(data.contacts || []);
      setIncoming(data.incoming || []);
    } catch (e) { /* ignore */ }
  }, [api]);

  const loadEvents = useCallback(async () => {
    try {
      const data = await api('/api/safesos/events', 'GET');
      setEvents(data.events || []);
    } catch (e) { /* ignore */ }
  }, [api]);

  const loadAll = useCallback(() => {
    loadStatus();
    loadContacts();
    loadEvents();
  }, [loadStatus, loadContacts, loadEvents]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // --- Circle actions ------------------------------------------------------
  const addContact = async () => {
    if (!contactForm.name.trim()) return toast('Enter a name or username.');
    try {
      const data = await api('/api/safesos/contacts', 'POST', {
        name: contactForm.name.trim(),
        relationship: contactForm.relationship,
      });
      toast(`Added ${data.contact.name} to your safety circle.`);
      setContactForm({ name: '', relationship: 'friend' });
      loadContacts();
      loadStatus();
    } catch (e: any) { toast(e.message || 'Could not add contact.', 'destructive'); }
  };

  const removeContact = async (id: string) => {
    try {
      await api(`/api/safesos/contacts/${id}`, 'DELETE');
      toast('Contact removed.');
      loadContacts();
      loadStatus();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const removeIncoming = async (id: string) => {
    try {
      await api(`/api/safesos/incoming/${id}`, 'DELETE');
      toast('Link removed. They can no longer see your alerts.');
      loadContacts();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const addBack = async (c: SafeContact) => {
    try {
      const data = await api('/api/safesos/contacts', 'POST', {
        contactUserId: c.addedById,
        relationship: c.relationship || 'friend',
      });
      toast(`Added ${data.contact.name} back to your circle.`);
      loadContacts();
      loadStatus();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  // --- SOS actions ----------------------------------------------------------
  const sendSos = async () => {
    setSending(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (sosForm.includeLocation) {
        const c = await getCoords();
        if (c) { lat = c.lat; lng = c.lng; }
      }
      await api('/api/safesos/events', 'POST', {
        kind: 'sos',
        note: sosForm.note.trim(),
        locationLabel: sosForm.locationLabel.trim(),
        shareLocation: !!sosForm.includeLocation,
        lat,
        lng,
      });
      toast(sosForm.includeLocation
        ? 'SOS sent to your circle with your precise location.'
        : 'SOS sent to your circle.');
      setSosForm({ note: '', locationLabel: '', includeLocation: false });
      loadAll();
    } catch (e: any) { toast(e.message || 'Failed to send SOS.', 'destructive'); }
    finally { setSending(false); }
  };

  const sendCheckin = async () => {
    try {
      await api('/api/safesos/events', 'POST', { kind: 'checkin', note: 'I am safe' });
      toast('Safe check-in sent to your circle.');
      loadAll();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const ackEvent = async (ev: SOSEvent, type: AckType) => {
    try {
      await api(`/api/safesos/events/${ev.id}/ack`, 'POST', { type });
      toast(type === 'on_my_way' ? 'Letting them know you are on the way.' : type === 'urgent' ? 'Urgent help noted.' : 'Alert acknowledged.');
      loadEvents();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const resolveEvent = async (ev: SOSEvent) => {
    try {
      await api(`/api/safesos/events/${ev.id}/resolve`, 'POST');
      toast('Marked as safe.');
      loadAll();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const reportEvent = async (ev: SOSEvent) => {
    try {
      await api(`/api/safesos/events/${ev.id}/report`, 'POST', { reason: 'fake' });
      toast('Reported. Repeated reports suppress an alert.');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  // --- Safe Walk actions -----------------------------------------------------
  const startWalk = async () => {
    let lat: number | undefined;
    let lng: number | undefined;
    if (walkForm.includeLocation) {
      const c = await getCoords();
      if (c) { lat = c.lat; lng = c.lng; }
    }
    try {
      await api('/api/safesos/walk', 'POST', {
        minutes: Number(walkForm.minutes) || 30,
        note: walkForm.note.trim(),
        locationLabel: walkForm.locationLabel.trim(),
        shareLocation: !!walkForm.includeLocation,
        lat,
        lng,
      });
      toast('Safe walk started. Check in before the deadline.');
      setWalkForm({ minutes: 30, note: '', locationLabel: '', includeLocation: false });
      loadAll();
    } catch (e: any) { toast(e.message || 'Could not start walk.', 'destructive'); }
  };

  const checkInWalk = async (ev: SOSEvent) => {
    try {
      await api(`/api/safesos/walk/${ev.id}/checkin`, 'POST');
      toast('Checked in — window extended.');
      loadAll();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const endWalk = async (ev: SOSEvent) => {
    try {
      await api(`/api/safesos/walk/${ev.id}/end`, 'POST');
      toast('Walk ended. You are safe.');
      loadAll();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  // Derived
  const myActiveWalk =
    status?.activeWalk ||
    events.find(
      (ev) => ev.kind === 'walk' && ev.initiatorId === currentUser?.id && ev.status !== 'resolved'
    ) ||
    null;

  const filteredEvents = events.filter((ev) => {
    if (evFilter === 'mine') return ev.initiatorId === currentUser?.id;
    if (evFilter === 'active') return ev.status === 'active' || ev.status === 'overdue';
    return true;
  });

  const inputCls =
    'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400';

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-full bg-rose-600/10 flex items-center justify-center">
            <Siren className="text-rose-600" size={18} />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Safety Circle</h2>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
              SOS · contacts · safe walk
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
          <Users className="mx-auto text-[#5c5446] dark:text-zinc-400" size={15} />
          <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.contactCount ?? 0}</div>
          <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">in circle</div>
        </div>
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
          <ShieldAlert className={`mx-auto text-rose-600 ${(status?.activeSosCount || 0) > 0 ? 'animate-pulse' : ''}`} size={15} />
          <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.activeSosCount ?? 0}</div>
          <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">active alerts</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ['circle', 'Circle'],
          ['sos', 'SOS'],
          ['walk', 'Safe Walk'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
              tab === k
                ? 'bg-[#3a342a] text-[#f4f1ea] dark:bg-amber-400 dark:text-zinc-900'
                : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── CIRCLE TAB ─────────────────────────────────────────────── */}
      {tab === 'circle' && (
        <div className="space-y-4">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
            <h3 className="flex items-center gap-2 font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
              <UserPlus size={14} className="text-[#5c5446] dark:text-zinc-400" /> Add a safety contact
            </h3>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">
              They will see your SOS alerts and can check on you. Contacts are only stored after you add them.
            </p>
            <div className="flex gap-2">
              <input
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') addContact(); }}
                placeholder="Name or username"
                className={inputCls}
              />
              <select
                value={contactForm.relationship}
                onChange={(e) => setContactForm({ ...contactForm, relationship: e.target.value })}
                className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm text-[#3a342a] dark:text-zinc-100"
              >
                {RELATIONSHIPS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <button
              onClick={addContact}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] transition-all"
            >
              <Plus size={12} /> Add contact
            </button>
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
            <h3 className="flex items-center gap-2 font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
              <Users size={14} className="text-[#5c5446] dark:text-zinc-400" /> My circle ({contacts.length})
            </h3>
            {contacts.length === 0 ? (
              <p className="text-xs text-[#8a8172] dark:text-zinc-500">No contacts yet. Add family, friends or neighbors who can check on you.</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3">
                    <span className="w-9 h-9 rounded-full bg-amber-800/10 dark:bg-amber-400/10 text-amber-800 dark:text-amber-400 flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
                      {initials(c.name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate">{c.name}</div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 capitalize">
                        {c.relationship} · {timeAgo(c.createdAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => removeContact(c.id)}
                      title="Remove contact"
                      className="text-[#8a8172] dark:text-zinc-500 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
            <h3 className="flex items-center gap-2 font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
              <HeartHandshake size={14} className="text-amber-600" /> People who added you ({incoming.length})
            </h3>
            {incoming.length === 0 ? (
              <p className="text-xs text-[#8a8172] dark:text-zinc-500">
                No one has listed you as a contact. They can see your alerts only once you add them back.
              </p>
            ) : (
              <div className="space-y-2">
                {incoming.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3">
                    <span className="w-9 h-9 rounded-full bg-emerald-800/10 dark:bg-emerald-400/10 text-emerald-800 dark:text-emerald-400 flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
                      {initials(c.addedByName || c.name)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate">{c.addedByName || c.name}</div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 capitalize">{c.relationship}</div>
                    </div>
                    <button
                      onClick={() => addBack(c)}
                      className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] transition-all"
                    >
                      Add back
                    </button>
                    <button
                      onClick={() => removeIncoming(c.id)}
                      title="Remove this link"
                      className="text-[#8a8172] dark:text-zinc-500 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SOS TAB ─────────────────────────────────────────────────── */}
      {tab === 'sos' && (
        <div className="space-y-4">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-rose-200 dark:border-rose-900/60 rounded-3xl p-5 space-y-3">
            <h3 className="flex items-center gap-2 font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
              <Siren className="text-rose-600" size={16} /> Panic SOS
            </h3>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">
              Broadcasts an alert to your safety circle. Precise GPS is shared only if you opt in below — your home address is never stored or broadcast.
            </p>
            <textarea
              value={sosForm.note}
              onChange={(e) => setSosForm({ ...sosForm, note: e.target.value })}
              placeholder="What's happening? (optional)"
              rows={2}
              className={`${inputCls} resize-none`}
            />
            <input
              value={sosForm.locationLabel}
              onChange={(e) => setSosForm({ ...sosForm, locationLabel: e.target.value })}
              placeholder="Approximate area (e.g. Old Town, near the market)"
              className={inputCls}
            />
            <label className="flex items-start gap-2 text-xs text-[#5c5446] dark:text-zinc-300">
              <input
                type="checkbox"
                checked={sosForm.includeLocation}
                onChange={(e) => setSosForm({ ...sosForm, includeLocation: e.target.checked })}
                className="mt-0.5 accent-rose-600"
              />
              <span>Include my precise location with this alert</span>
            </label>
            <button
              onClick={sendSos}
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold py-3.5 disabled:opacity-50 transition-all animate-pulse shadow-[0_8px_30px_rgba(225,29,72,0.35)]"
            >
              <Siren size={16} /> {sending ? 'Sending…' : 'SEND SOS'}
            </button>
            <button
              onClick={sendCheckin}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-3 transition-all"
            >
              <ShieldCheck size={16} /> I'm safe — check in
            </button>
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
                <LifeBuoy size={14} className="text-[#5c5446] dark:text-zinc-400" /> Alerts
              </h3>
              <div className="flex gap-1">
                {([['all', 'All'], ['active', 'Active'], ['mine', 'Mine']] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setEvFilter(k)}
                    className={`font-mono text-[8px] uppercase font-bold tracking-wider py-1 px-2 rounded-full transition-all ${
                      evFilter === k
                        ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
                        : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <ShieldCheck className="mx-auto text-emerald-500" size={24} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No alerts here yet.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Alerts from your circle appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEvents.map((ev) => {
                  const isMine = ev.initiatorId === currentUser?.id;
                  const active = ev.status === 'active' || ev.status === 'overdue';
                  return (
                    <motion.div
                      key={ev.id}
                      layout
                      className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            ev.status === 'overdue'
                              ? 'bg-rose-600 animate-pulse'
                              : ev.kind === 'sos'
                                ? active ? 'bg-rose-600 animate-pulse' : 'bg-rose-300'
                                : ev.kind === 'walk'
                                  ? active ? 'bg-amber-400 animate-pulse' : 'bg-amber-200'
                                  : 'bg-emerald-500'
                          }`}
                        />
                        <span className="font-mono text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300">
                          {ev.kind === 'sos' ? 'SOS' : ev.kind === 'walk' ? 'Safe walk' : 'Check-in'}
                        </span>
                        <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${ev.status === 'overdue' ? 'bg-rose-50 text-rose-500' : ev.status === 'active' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {ev.status}
                        </span>
                        <button
                          onClick={() => reportEvent(ev)}
                          title="Report fake/abusive alert"
                          className="ml-auto text-[#8a8172] dark:text-zinc-500 hover:text-rose-600 transition-colors"
                        >
                          <ShieldAlert size={13} />
                        </button>
                      </div>

                      <div className="text-sm font-display font-bold text-[#3a342a] dark:text-zinc-100">
                        {ev.initiatorName} {isMine && <span className="text-xs font-normal text-[#8a8172]">(you)</span>}
                      </div>
                      {ev.note && <p className="text-xs text-[#5c5446] dark:text-zinc-300">{ev.note}</p>}

                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#8a8172] dark:text-zinc-500 font-mono uppercase tracking-wide">
                        {ev.locationLabel && (
                          <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {ev.locationLabel}</span>
                        )}
                        {ev.location && (
                          <span className="flex items-center gap-1 normal-case text-rose-600">
                            <LocateFixed size={11} /> Precise location shared
                          </span>
                        )}
                        <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(ev.createdAt)}</span>
                        {ev.kind === 'walk' && ev.checkinDue && active && (
                          <span className={`flex items-center gap-1 ${ev.status === 'overdue' ? 'text-rose-600' : 'text-amber-600'}`}>
                            <Timer size={11} /> due {formatTime(ev.checkinDue)} · {timeLeft(ev.checkinDue)}
                          </span>
                        )}
                      </div>

                      {ev.acks.length > 0 && (
                        <div className="text-[10px] text-[#8a8172] dark:text-zinc-500">
                          {ev.acks.map((a) => (
                            <span key={a.userId} className="inline-flex items-center gap-1 mr-2">
                              <CheckCheck size={10} className="text-emerald-600" /> {a.userName} · {ACK_LABEL[a.type]}
                            </span>
                          ))}
                        </div>
                      )}

                      {!isMine && active && ev.kind !== 'walk' && (
                        <div className="flex gap-2 pt-1">
                          {ACK_OPTIONS.map((opt) => (
                            <button
                              key={opt.type}
                              onClick={() => ackEvent(ev, opt.type)}
                              className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg transition-all ${opt.cls}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {isMine && active && ev.kind === 'walk' && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => checkInWalk(ev)}
                            className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
                          >
                            <CheckCheck size={11} /> Check in
                          </button>
                          <button
                            onClick={() => endWalk(ev)}
                            className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-transparent text-[#5c5446] dark:text-zinc-300 border border-[#ebdcca] dark:border-zinc-700 hover:bg-[#ebdcca]/40 transition-all"
                          >
                            End walk
                          </button>
                        </div>
                      )}

                      {isMine && active && ev.kind !== 'walk' && (
                        <button
                          onClick={() => resolveEvent(ev)}
                          className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-transparent text-emerald-700 dark:text-emerald-400 border border-emerald-300/50 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-all"
                        >
                          <CheckCircle2 size={11} /> Mark safe
                        </button>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── WALK TAB ─────────────────────────────────────────────────── */}
      {tab === 'walk' && (
        <div className="space-y-4">
          {myActiveWalk ? (
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-amber-200 dark:border-amber-900/60 rounded-3xl p-5 space-y-3">
              <h3 className="flex items-center gap-2 font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
                <Footprints className="text-amber-600" size={16} /> Active safe walk
              </h3>

              {myActiveWalk.status === 'overdue' && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-300">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    <b>Overdue</b> — your check-in window passed and your circle has been told to check on you.
                    If you are safe, check in now.
                  </span>
                </div>
              )}

              <div className="rounded-2xl border border-[#ebdcca]/70 dark:border-zinc-700 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Check-in due</span>
                  <span className="font-mono font-bold text-[#3a342a] dark:text-zinc-100">{formatTime(myActiveWalk.checkinDue)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Time left</span>
                  <span className={`font-mono font-bold ${myActiveWalk.status === 'overdue' ? 'text-rose-600' : 'text-amber-600'}`}>{timeLeft(myActiveWalk.checkinDue)}</span>
                </div>
                {myActiveWalk.note && <p className="text-xs text-[#5c5446] dark:text-zinc-300">{myActiveWalk.note}</p>}
                {myActiveWalk.locationLabel && (
                  <div className="flex items-center gap-1 text-[10px] text-[#8a8172] dark:text-zinc-500"><MapPin size={11} /> {myActiveWalk.locationLabel}</div>
                )}
                <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  {myActiveWalk.checkinCount || 1} check-in{(myActiveWalk.checkinCount || 1) > 1 ? 's' : ''} · window {myActiveWalk.windowMinutes || 30} min
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => checkInWalk(myActiveWalk)}
                  className="flex items-center gap-1.5 flex-1 justify-center font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 transition-all"
                >
                  <CheckCheck size={13} /> I'm safe
                </button>
                <button
                  onClick={() => endWalk(myActiveWalk)}
                  className="flex items-center gap-1.5 flex-1 justify-center font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-white border border-[#cfcac0] text-[#3a342a] dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-100 hover:bg-[#ebdcca]/40 transition-all"
                >
                  <Navigation size={13} /> End walk
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-amber-200 dark:border-amber-900/60 rounded-3xl p-5 space-y-3">
              <h3 className="flex items-center gap-2 font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
                <Footprints className="text-amber-600" size={16} /> Start a safe walk
              </h3>
              <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">
                Walking alone? Your circle is told to check on you if you miss the deadline check-in.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 block mb-1">Check-in window (min)</label>
                  <input
                    type="number"
                    value={walkForm.minutes || 30}
                    onChange={(e) => setWalkForm({ ...walkForm, minutes: Number(e.target.value) })}
                    min={5}
                    max={180}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 block mb-1">Approximate area</label>
                  <input
                    value={walkForm.locationLabel}
                    onChange={(e) => setWalkForm({ ...walkForm, locationLabel: e.target.value })}
                    placeholder="e.g. Old Town, river path"
                    className={inputCls}
                  />
                </div>
              </div>
              <input
                value={walkForm.note}
                onChange={(e) => setWalkForm({ ...walkForm, note: e.target.value })}
                placeholder="Destination or note (optional)"
                className={inputCls}
              />
              <label className="flex items-start gap-2 text-xs text-[#5c5446] dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={walkForm.includeLocation}
                  onChange={(e) => setWalkForm({ ...walkForm, includeLocation: e.target.checked })}
                  className="mt-0.5 accent-amber-600"
                />
                <span>Include my precise location with this walk</span>
              </label>
              <button
                onClick={startWalk}
                className="flex items-center justify-center gap-1.5 w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-amber-700 text-[#f4f1ea] hover:bg-amber-600 transition-all"
              >
                <Send size={13} /> Start safe walk
              </button>
            </div>
          )}

          <p className="text-[10px] text-center text-[#8a8172] dark:text-zinc-500">
            <ShieldCheck className="inline mr-1" size={11} /> Safety Circle never stores your home address and only shares precise location when you opt in.
          </p>
        </div>
      )}
    </div>
  );
}
