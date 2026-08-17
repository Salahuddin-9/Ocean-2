import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Siren, X, MapPin, AlertTriangle, Send, ShieldCheck, Phone, Users, Clock,
  CheckCircle2, Plus, LocateFixed, Bell, UserPlus, Trash2, Eye, EyeOff,
  LifeBuoy, Megaphone, HandCoins, HeartHandshake,
} from 'lucide-react';

/**
 * Ocean — SOS Panic + Emergency Contacts
 * --------------------------------------
 * A backend-wired panic-alert board that extends the emergency UX (EmergencyView /
 * turtleEmergencyPoolsBackend). The floating SOSEmergencyButton stays client-side;
 * this view is the real SOS system.
 *
 *  - Panic tab: one-tap SOS broadcast. The fuzzy area + message are broadcast; precise
 *    location is attached ONLY when the user checks the opt-in box on that tap, and is
 *    only revealed to the alert creator and acknowledged responders. Contact-only alerts
 *    reach only the user's listed emergency contacts.
 *  - Feed tab: community SOS feed — acknowledge ("I'm coming / I saw this"), resolve your
 *    own alert. Acknowledging earns safety coins.
 *  - Contacts tab: emergency contacts are stored only when the user adds them; they are
 *    never shown publicly.
 *
 *  Backed by /api/sos/* (turtleSOSAlertBackend.ts).
 */

interface SOSAlertViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

type Urgency = 'low' | 'medium' | 'high' | 'critical';
type SOSStatus = 'active' | 'acknowledged' | 'resolved' | 'expired';
type Tab = 'panic' | 'feed' | 'contacts';
type Scope = 'active' | 'mine' | 'resolved';

interface SOSContact {
  id: string;
  name: string;
  phone?: string;
  relationship?: string;
  linkedUserId?: string;
  createdAt: number;
}

interface SOSAck {
  id: string;
  byUserId: string;
  byName: string;
  note: string;
  contactLine?: string;
  at: number;
}

interface SOSAlert {
  id: string;
  creatorId: string;
  creatorName: string;
  urgency: Urgency;
  area: string;
  message: string;
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  contactOnly: boolean;
  status: SOSStatus;
  createdAt: number;
  expiresAt: number;
  isMine: boolean;
  ackCount: number;
  myAck: SOSAck | null;
  acknowledgements: SOSAck[];
}

interface Meta {
  disclaimer: string;
  relationships: string[];
  urgencyOptions: Urgency[];
  coinRewards: { acknowledge: number };
  maxContacts: number;
  cooldownSec: number;
  viewerId: string | null;
}

const URGENCY_STYLE: Record<Urgency, string> = {
  critical: 'bg-red-600', high: 'bg-orange-500', medium: 'bg-amber-400', low: 'bg-emerald-500',
};

const STATUS_STYLE: Record<SOSStatus, string> = {
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

export default function SOSAlertView({ token, currentUser, onClose }: SOSAlertViewProps) {
  const [tab, setTab] = useState<Tab>('panic');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [contacts, setContacts] = useState<SOSContact[]>([]);
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [scope, setScope] = useState<Scope>('active');

  const [composerOpen, setComposerOpen] = useState(false);
  const [panicForm, setPanicForm] = useState({
    message: '', area: '', urgency: 'critical' as Urgency,
    contactOnly: false, shareLocation: false, acceptedDisclaimer: false,
  });
  const [panicBusy, setPanicBusy] = useState(false);
  const [sentAlert, setSentAlert] = useState<SOSAlert | null>(null);

  const [ackAlertId, setAckAlertId] = useState<string | null>(null);
  const [ackForm, setAckForm] = useState({ note: '', contactLine: '' });

  const [contactForm, setContactForm] = useState({
    name: '', phone: '', relationship: '', linkedUserId: '',
  });
  const [contactBusy, setContactBusy] = useState(false);

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
      const data = await api('/api/sos/meta', 'GET');
      setMeta(data);
    } catch { /* meta is non-critical */ }
  }, [token]);

  const loadContacts = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api('/api/sos/contacts', 'GET');
      setContacts(data.contacts || []);
    } catch { /* ignore */ }
  }, [token]);

  const loadAlerts = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api(`/api/sos/alerts?scope=${scope}`, 'GET');
      setAlerts(data.alerts || []);
    } catch (e: any) {
      toast(e.message || 'Failed to load alerts.', 'destructive');
    }
  }, [token, scope]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { if (tab === 'contacts') loadContacts(); }, [tab, loadContacts]);
  useEffect(() => { if (tab === 'feed') loadAlerts(); }, [tab, loadAlerts]);

  // Realtime-lite: poll the SOS feed while open so new alerts arrive without
  // a manual refresh (production-safe — no WebSocket dependency).
  useEffect(() => {
    if (tab !== 'feed') return;
    const t = setInterval(() => { loadAlerts(); }, 30000);
    return () => clearInterval(t);
  }, [tab, loadAlerts]);

  // --- Panic ------------------------------------------------------------------
  const sendSOS = async () => {
    if (!panicForm.acceptedDisclaimer) return toast('Please accept the safety agreement.');
    if (panicForm.message.trim().length < 5) return toast('Describe the emergency (at least 5 characters).');
    setPanicBusy(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (panicForm.shareLocation) {
        const c = await getCoords();
        if (c) { lat = c.lat; lng = c.lng; }
        else toast('Location unavailable — sending without precise location.', 'destructive');
      }
      const data = await api('/api/sos/alert', 'POST', {
        message: panicForm.message.trim(),
        area: panicForm.area.trim(),
        urgency: panicForm.urgency,
        contactOnly: panicForm.contactOnly,
        shareLocation: panicForm.shareLocation,
        lat,
        lng,
      });
      setSentAlert(data.alert || null);
      setComposerOpen(false);
      setPanicForm({ message: '', area: '', urgency: 'critical', contactOnly: false, shareLocation: false, acceptedDisclaimer: false });
      toast(panicForm.contactOnly
        ? 'SOS sent to your emergency contacts.'
        : panicForm.shareLocation
          ? 'SOS broadcast (precise location shared with responders).'
          : 'SOS broadcast to the community.');
      if (data.contactCount === 0 && panicForm.contactOnly) {
        toast('Add emergency contacts on the Contacts tab so they are reached.', 'destructive');
      }
      setTab('feed');
      loadAlerts();
    } catch (e: any) {
      toast(e.message || 'Could not send SOS.', 'destructive');
    } finally {
      setPanicBusy(false);
    }
  };

  // --- Feed -------------------------------------------------------------------
  const acknowledgeAlert = async (a: SOSAlert) => {
    if (ackForm.note.trim().length < 2) return toast('Add a short note (at least 2 characters).');
    try {
      const data = await api(`/api/sos/alerts/${a.id}/acknowledge`, 'POST', {
        note: ackForm.note.trim(),
        contactLine: ackForm.contactLine.trim(),
      });
      toast(`Acknowledged. +${data.coins} safety coins.`);
      setAckAlertId(null);
      setAckForm({ note: '', contactLine: '' });
      loadAlerts();
    } catch (e: any) {
      toast(e.message || 'Could not acknowledge.', 'destructive');
    }
  };

  const resolveAlert = async (a: SOSAlert) => {
    try {
      await api(`/api/sos/alerts/${a.id}/resolve`, 'POST');
      toast('Alert marked resolved — stay safe.');
      loadAlerts();
    } catch (e: any) {
      toast(e.message || 'Could not resolve.', 'destructive');
    }
  };

  // --- Contacts ----------------------------------------------------------------
  const addContact = async () => {
    if (contactForm.name.trim().length < 2) return toast('Contact name is required.');
    setContactBusy(true);
    try {
      const data = await api('/api/sos/contacts', 'POST', {
        name: contactForm.name.trim(),
        phone: contactForm.phone.trim(),
        relationship: contactForm.relationship,
        linkedUserId: contactForm.linkedUserId.trim(),
      });
      setContacts(data.contacts || []);
      setContactForm({ name: '', phone: '', relationship: '', linkedUserId: '' });
      toast('Emergency contact added. They are notified on your next SOS.');
    } catch (e: any) {
      toast(e.message || 'Could not add contact.', 'destructive');
    } finally {
      setContactBusy(false);
    }
  };

  const removeContact = async (c: SOSContact) => {
    try {
      const data = await api(`/api/sos/contacts/${c.id}/remove`, 'POST');
      setContacts(data.contacts || []);
      toast('Contact removed.');
    } catch (e: any) {
      toast(e.message || 'Could not remove contact.', 'destructive');
    }
  };

  const visible = (a: SOSAlert) => {
    const canAck = !a.isMine && (a.status === 'active' || a.status === 'acknowledged') && !a.myAck;
    const canResolve = a.isMine && (a.status === 'active' || a.status === 'acknowledged');
    return { canAck, canResolve };
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4"
    >
      <div className="max-w-xl mx-auto space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-red-600/10 flex items-center justify-center">
              <Siren className="text-red-600" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">SOS Alert</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                Panic button · emergency contacts
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
            Sign in to send SOS alerts, manage emergency contacts, and acknowledge others.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {([['panic', 'Panic'], ['feed', 'Feed'], ['contacts', 'Contacts']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={chipCls(tab === k)}>
              {label}
            </button>
          ))}
        </div>

        {/* ================= PANIC TAB ================= */}
        {tab === 'panic' && (
          <div className="space-y-4">
            <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 space-y-4">
              <div className="text-center space-y-2">
                <span className="w-20 h-20 rounded-full bg-red-600/10 flex items-center justify-center mx-auto">
                  <Siren className="text-red-600 animate-pulse" size={36} />
                </span>
                <h3 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">Need urgent help?</h3>
                <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                  Sending an SOS broadcasts the event to the community (or just your emergency contacts).
                  Your fuzzy area is always shown; precise location is attached only if you opt in, this tap only.
                </p>
              </div>

              <button
                onClick={() => setComposerOpen(!composerOpen)}
                className="w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl bg-rose-600 text-white font-mono text-[11px] uppercase font-bold tracking-widest hover:bg-rose-500 transition-all shadow-lg"
              >
                <AlertTriangle size={16} /> {composerOpen ? 'Close SOS composer' : 'Send SOS'}
              </button>

              {sentAlert && (
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                  <p className="font-bold flex items-center gap-1.5"><CheckCircle2 size={13} /> SOS broadcast live.</p>
                  <p>#{sentAlert.id} · {sentAlert.area} · {sentAlert.ackCount} response{sentAlert.ackCount === 1 ? '' : 's'} so far.</p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Track it and resolve it from the Feed tab.</p>
                </div>
              )}
            </div>

            <AnimatePresence>
              {composerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3"
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">
                    <Megaphone size={11} /> Compose SOS
                  </div>
                  <textarea
                    value={panicForm.message}
                    onChange={(e) => setPanicForm({ ...panicForm, message: e.target.value })}
                    placeholder="What's happening? What help do you need?"
                    rows={3}
                    className={inputCls + ' resize-none'}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={panicForm.area}
                      onChange={(e) => setPanicForm({ ...panicForm, area: e.target.value })}
                      placeholder="Fuzzy area (e.g. North Beach)"
                      className={inputCls}
                    />
                    <select
                      value={panicForm.urgency}
                      onChange={(e) => setPanicForm({ ...panicForm, urgency: e.target.value as Urgency })}
                      className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm capitalize"
                    >
                      {(['critical', 'high', 'medium', 'low'] as Urgency[]).map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-[#5c5446] dark:text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={panicForm.contactOnly}
                      onChange={(e) => setPanicForm({ ...panicForm, contactOnly: e.target.checked })}
                      className="accent-rose-600"
                    />
                    <span className="flex items-center gap-1"><Users size={12} /> Only notify my emergency contacts</span>
                  </label>

                  <label className="flex items-start gap-2 text-[10px] text-[#5c5446] dark:text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={panicForm.shareLocation}
                      onChange={(e) => setPanicForm({ ...panicForm, shareLocation: e.target.checked })}
                      className="mt-0.5 accent-rose-600"
                    />
                    <span className="flex items-center gap-1">
                      {panicForm.shareLocation ? <Eye size={12} /> : <EyeOff size={12} />}
                      Share my precise location on this alert only (opt-in, this tap only). Visible to the creator and responders.
                    </span>
                  </label>

                  <label className="flex items-start gap-2 text-[10px] text-[#5c5446] dark:text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={panicForm.acceptedDisclaimer}
                      onChange={(e) => setPanicForm({ ...panicForm, acceptedDisclaimer: e.target.checked })}
                      className="mt-0.5 accent-rose-600"
                    />
                    <span>I accept the <b>safety agreement</b>.</span>
                  </label>

                  {panicForm.acceptedDisclaimer && meta?.disclaimer && (
                    <pre className="text-[9px] leading-relaxed text-[#8a8172] dark:text-zinc-500 bg-white/60 dark:bg-zinc-800/60 border border-[#ebdcca] dark:border-zinc-700 rounded-xl p-3 whitespace-pre-wrap max-h-24 overflow-y-auto font-sans">
                      {meta.disclaimer}
                    </pre>
                  )}

                  <button
                    onClick={sendSOS} disabled={panicBusy}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-600 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-500 disabled:opacity-50"
                  >
                    <Send size={13} /> {panicBusy ? 'Sending…' : 'Send SOS'}
                  </button>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 text-center">
                    Max 2 alerts per 15 minutes
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ================= FEED TAB ================= */}
        {tab === 'feed' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {([['active', 'Active'], ['mine', 'Mine'], ['resolved', 'Resolved']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setScope(k)} className={chipCls(scope === k)}>
                  {label}
                </button>
              ))}
            </div>

            {alerts.length === 0 ? (
              <div className="py-14 text-center space-y-2 bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl">
                <HeartHandshake className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No SOS alerts here.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  {scope === 'active' ? 'You can be the first to help' : 'Alerts you post or resolve appear here'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((a) => {
                  const { canAck, canResolve } = visible(a);
                  return (
                    <motion.div
                      key={a.id} layout
                      className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-[#fcfaf4] dark:bg-zinc-900 p-4 shadow-sm space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${URGENCY_STYLE[a.urgency]} ${a.urgency === 'critical' ? 'animate-pulse' : ''}`} />
                        <h4 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1 truncate">
                          {a.isMine ? 'Your SOS' : `SOS from ${a.creatorName}`}
                        </h4>
                        <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[a.status]}`}>{a.status}</span>
                      </div>
                      <p className="text-xs text-[#3a342a] dark:text-zinc-100">{a.message}</p>
                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
                        <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {a.area}</span>
                        {a.contactOnly && <span className="flex items-center gap-1"><Users size={11} /> contacts only</span>}
                        {a.shareLocation && <span className="flex items-center gap-1 text-emerald-600"><LocateFixed size={11} /> precise location shared</span>}
                        <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(a.createdAt)}</span>
                        <span className="flex items-center gap-1"><Bell size={11} /> {a.ackCount} response{a.ackCount === 1 ? '' : 's'}</span>
                      </div>

                      <div className="flex gap-2 flex-wrap">
                        {canAck && (
                          <button
                            onClick={() => setAckAlertId(ackAlertId === a.id ? null : a.id)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-emerald-800"
                          >
                            <LifeBuoy size={12} /> Acknowledge (+{meta?.coinRewards.acknowledge ?? 10})
                          </button>
                        )}
                        {canResolve && (
                          <button
                            onClick={() => resolveAlert(a)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-emerald-800"
                          >
                            <CheckCircle2 size={12} /> Mark resolved
                          </button>
                        )}
                        {a.myAck && (
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 size={11} /> You acknowledged
                          </span>
                        )}
                      </div>

                      <AnimatePresence>
                        {ackAlertId === a.id && canAck && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            className="space-y-2 overflow-hidden"
                          >
                            <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
                              <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">
                                I'm coming / I saw this
                              </div>
                              <input
                                value={ackForm.note}
                                onChange={(e) => setAckForm({ ...ackForm, note: e.target.value })}
                                placeholder="e.g. I'm 10 min away, staying with you"
                                className={inputCls}
                              />
                              <input
                                value={ackForm.contactLine}
                                onChange={(e) => setAckForm({ ...ackForm, contactLine: e.target.value })}
                                placeholder="Contact line (optional, revealed only to the alert creator)"
                                className={inputCls}
                              />
                              <button
                                onClick={() => acknowledgeAlert(a)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 text-white text-[10px] font-mono uppercase font-bold hover:bg-emerald-800"
                              >
                                <Send size={12} /> Acknowledge
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {a.isMine && a.acknowledgements.length > 0 && (
                        <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-1.5">
                          <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">
                            Responders ({a.acknowledgements.length})
                          </div>
                          {a.acknowledgements.map((x) => (
                            <div key={x.id} className="text-xs text-[#3a342a] dark:text-zinc-100">
                              <b>{x.byName}</b> — {x.note || 'acknowledged'}
                              {x.contactLine && <span className="text-emerald-600 dark:text-emerald-400"> · {x.contactLine}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= CONTACTS TAB ================= */}
        {tab === 'contacts' && (
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                <ShieldCheck className="text-red-600" size={15} /> Emergency contacts
              </h3>
              <span className="font-mono text-[9px] uppercase text-[#8a8172]">{contacts.length}/{meta?.maxContacts ?? 8}</span>
            </div>

            <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 flex items-center gap-1">
              <EyeOff size={11} /> Stored only when you add them, and never shown publicly. Contact-only SOS alerts reach them in-app.
            </p>

            <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">
                <UserPlus size={11} /> Add contact
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  placeholder="Name"
                  className={inputCls}
                />
                <input
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  placeholder="Phone (optional)"
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={contactForm.relationship}
                  onChange={(e) => setContactForm({ ...contactForm, relationship: e.target.value })}
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm"
                >
                  <option value="">Relationship…</option>
                  {(meta?.relationships || ['family', 'partner', 'friend', 'neighbor', 'colleague', 'other']).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <input
                  value={contactForm.linkedUserId}
                  onChange={(e) => setContactForm({ ...contactForm, linkedUserId: e.target.value })}
                  placeholder="Ocean user id (optional)"
                  className={inputCls}
                />
              </div>
              <button
                onClick={addContact} disabled={contactBusy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] disabled:opacity-50"
              >
                <Plus size={12} /> {contactBusy ? 'Adding…' : 'Add contact'}
              </button>
            </div>

            {contacts.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Phone className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No emergency contacts yet.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                  Add the people you trust to reach in a crisis
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div key={c.id} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 flex items-center justify-center text-[11px] font-bold">
                      {(c.name || '?').slice(0, 1).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate">{c.name}</div>
                      <div className="text-[10px] text-[#8a8172] dark:text-zinc-400 flex items-center gap-2 flex-wrap">
                        {c.relationship && <span className="capitalize">{c.relationship}</span>}
                        {c.phone && <span className="flex items-center gap-1 normal-case"><Phone size={9} /> {c.phone}</span>}
                        {c.linkedUserId && <span className="font-mono">linked</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => removeContact(c)}
                      className="text-[#8a8172] hover:text-red-600 transition-colors"
                      title="Remove contact"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-1">
              <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                <HandCoins size={11} /> Safety coins
              </div>
              <ul className="text-[10px] text-[#8a8172] dark:text-zinc-400 space-y-0.5">
                <li>+{meta?.coinRewards.acknowledge ?? 10} · acknowledge someone's SOS (responder reward)</li>
                <li>No cost to send an SOS — 2 alerts / 15 min to prevent noise.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
