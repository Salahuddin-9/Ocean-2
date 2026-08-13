import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Eye, X, MapPin, Users, Plus, Clock, ShieldCheck, CheckCircle2, Trash2,
  LocateFixed, Coins, Phone, Footprints, ListChecks, Bell, Hammer, HeartHandshake,
} from 'lucide-react';

/**
 * Ocean — SafeWatch (Neighborhood Safety Watch & Civic Hazard Reporting)
 * ----------------------------------------------------------------------
 * Extends the emergency UX (EmergencyView covers community emergency pools; this
 * covers neighborhood observability): civic hazard reports, verified by neighbor
 * confirmations, neighborhood safety observations, "I need eyes on this" watch
 * alerts, an area watch score, and a privacy-first watch circle.
 *
 * Privacy (rule 4): fuzzy area labels are always what is broadcast. Precise GPS is
 * attached ONLY when you tap the explicit "share precise location" toggle on a
 * watch alert, and is revealed only to the creator + acknowledged watchers. Your
 * watch-circle contacts are stored only after you add them and are never broadcast.
 *
 * Backed by /api/watch/* (turtleSafeWatchBackend.ts).
 */

type Kind = 'hazard' | 'observation' | 'alert';
type Status =
  | 'submitted' | 'confirmed' | 'in_progress' | 'resolved' | 'dismissed'
  | 'active' | 'acknowledged' | 'expired';

interface WatchPost {
  id: string;
  kind: Kind;
  category: string;
  categoryLabel: string;
  areaLabel: string;
  description: string;
  createdById: string;
  createdByName: string;
  status: Status;
  confirmations: number;
  confirmedByMe: boolean;
  ackCount: number;
  myAck: { id: string; byName: string; note: string } | null;
  shareLocation: boolean;
  notifyCircle: boolean;
  notifiedContactCount: number;
  resolvedAt?: number;
  resolvedByName?: string;
  resolvedNote?: string;
  createdAt: number;
  expiresAt?: number;
  isMine: boolean;
  canConfirm: boolean;
  lat?: number;
  lng?: number;
}

interface WatchContact {
  id: string;
  name: string;
  phone?: string;
  username?: string;
  linkedUserId?: string;
  createdAt: number;
}

interface AreaRating {
  area: string;
  reportCount: number;
  confirmedCount: number;
  resolvedCount: number;
  score: number;
  level: 'well_watched' | 'watchful' | 'emerging';
}

interface SafeWatchViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const CATEGORY_FALLBACK: { id: string; label: string }[] = [
  { id: 'road', label: 'Road damage' },
  { id: 'streetlight', label: 'Streetlight out' },
  { id: 'water', label: 'Waterlogging' },
  { id: 'power', label: 'Power outage' },
  { id: 'garbage', label: 'Garbage / sanitation' },
  { id: 'structure', label: 'Structural risk' },
  { id: 'unlit', label: 'Unlit area' },
  { id: 'suspicious', label: 'Suspicious activity' },
  { id: 'safety', label: 'Safety concern' },
  { id: 'other', label: 'Other' },
];

const STATUS_BADGE: Record<string, string> = {
  submitted: 'bg-amber-50 text-amber-600',
  confirmed: 'bg-emerald-50 text-emerald-600',
  in_progress: 'bg-sky-50 text-sky-600',
  resolved: 'bg-zinc-100 text-zinc-500',
  dismissed: 'bg-zinc-100 text-zinc-400',
  active: 'bg-rose-50 text-rose-500',
  acknowledged: 'bg-orange-50 text-orange-500',
  expired: 'bg-zinc-100 text-zinc-400',
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const KIND_ICON: Record<Kind, React.ReactNode> = {
  hazard: <Hammer size={14} />,
  observation: <Eye size={14} />,
  alert: <Bell size={14} />,
};

export default function SafeWatchView({ token, currentUser, onClose }: SafeWatchViewProps) {
  const [tab, setTab] = useState<'watch' | 'report' | 'alerts' | 'circle' | 'mine'>('watch');
  const [posts, setPosts] = useState<WatchPost[]>([]);
  const [categories, setCategories] = useState(CATEGORY_FALLBACK);
  const [counts, setCounts] = useState<any>({});
  const [areaRatings, setAreaRatings] = useState<AreaRating[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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
    try {
      const res = await fetch('/api/watch/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts || {});
        setAreaRatings(data.areaRatings || []);
        setMe(data.me || null);
        if (data.categories?.length) setCategories(data.categories);
      }
    } catch (e) { /* ignore */ }
  }, [token]);

  const loadPosts = useCallback(async (kind?: string) => {
    setLoading(true);
    try {
      const q = kind ? `?kind=${kind}` : '';
      const res = await fetch(`/api/watch/posts${q}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (e) {
      console.error('Failed to load watch feed:', e);
    }
    setLoading(false);
  }, [token]);

  const refresh = useCallback(async (kind?: string) => {
    await Promise.all([loadStatus(), loadPosts(kind)]);
  }, [loadStatus, loadPosts]);

  useEffect(() => { refresh('reports'); }, [refresh]);

  // --- actions ------------------------------------------------------------

  const confirmPost = async (post: WatchPost) => {
    try {
      await api(`/api/watch/posts/${post.id}/confirm`, 'POST');
      toast('Confirmed. Thanks for keeping the watch.');
      refresh('reports');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const ackPost = async (post: WatchPost) => {
    try {
      await api(`/api/watch/posts/${post.id}/ack`, 'POST', { note: 'Eyes on this.' });
      toast('Acknowledged. The reporter has been notified.');
      refresh('alert');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const setPostStatus = async (post: WatchPost, status: string) => {
    try {
      await api(`/api/watch/posts/${post.id}/status`, 'POST', { status });
      toast(status === 'resolved' ? 'Marked resolved.' : status === 'in_progress' ? 'Marked in progress.' : 'Report dismissed.');
      refresh(post.kind === 'alert' ? 'alert' : 'reports');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  // --- report composer ------------------------------------------------------

  const [form, setForm] = useState({
    kind: 'hazard' as Kind,
    category: 'road',
    areaLabel: '',
    description: '',
  });

  const createPost = async () => {
    if (form.description.trim().length < 5) return toast('Describe the report (at least 5 characters).');
    setSaving(true);
    try {
      await api('/api/watch/posts', 'POST', {
        kind: form.kind,
        category: form.category,
        areaLabel: form.areaLabel.trim(),
        description: form.description.trim(),
      });
      toast(form.kind === 'hazard' ? 'Hazard reported to the watch.' : 'Observation posted.');
      setForm({ kind: 'hazard', category: 'road', areaLabel: '', description: '' });
      refresh('reports');
    } catch (e: any) {
      toast(e.message, 'destructive');
    } finally { setSaving(false); }
  };

  // --- watch alert composer -------------------------------------------------

  const [alertForm, setAlertForm] = useState({
    description: '',
    areaLabel: '',
    shareLocation: false,
    notifyCircle: false,
  });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);

  const grabLocation = () => {
    if (!('geolocation' in navigator)) return toast('Geolocation is not available on this device.', 'destructive');
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAlertForm((f) => ({ ...f, shareLocation: true }));
        setGpsBusy(false);
        toast('Precise location captured — will be sent with this alert.');
      },
      () => {
        setGpsBusy(false);
        toast('Could not get location. The alert will go out with the area label only.', 'destructive');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const raiseAlert = async () => {
    if (alertForm.description.trim().length < 5) return toast('Describe what you need eyes on (at least 5 characters).');
    setSaving(true);
    try {
      const data = await api('/api/watch/posts', 'POST', {
        kind: 'alert',
        description: alertForm.description.trim(),
        areaLabel: alertForm.areaLabel.trim(),
        shareLocation: alertForm.shareLocation,
        lat: alertForm.shareLocation && gps ? gps.lat : undefined,
        lng: alertForm.shareLocation && gps ? gps.lng : undefined,
        notifyCircle: alertForm.notifyCircle,
      });
      toast(
        data.contactCount > 0
          ? `Watch alert raised — notified ${data.contactCount} circle contact(s).`
          : 'Watch alert raised. Neighbours can acknowledge it.'
      );
      setAlertForm({ description: '', areaLabel: '', shareLocation: false, notifyCircle: false });
      setGps(null);
      setTab('alerts');
      refresh('alert');
    } catch (e: any) {
      toast(e.message, 'destructive');
    } finally { setSaving(false); }
  };

  // --- circle ---------------------------------------------------------------

  const [contacts, setContacts] = useState<WatchContact[]>([]);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', username: '' });

  const loadContacts = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api('/api/watch/contacts', 'GET');
      setContacts(data.contacts || []);
    } catch (e) { /* ignore */ }
  }, [token]);

  useEffect(() => { if (tab === 'circle') loadContacts(); }, [tab, loadContacts]);

  const addContact = async () => {
    if (contactForm.name.trim().length < 2) return toast('Contact name is required.');
    try {
      const data = await api('/api/watch/contacts', 'POST', {
        name: contactForm.name.trim(),
        phone: contactForm.phone.trim(),
        username: contactForm.username.trim(),
      });
      setContacts(data.contacts || []);
      setContactForm({ name: '', phone: '', username: '' });
      toast('Contact added to your watch circle.');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const removeContact = async (c: WatchContact) => {
    try {
      const data = await api(`/api/watch/contacts/${c.id}/remove`, 'POST');
      setContacts(data.contacts || []);
      toast('Contact removed.');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  // --- mine -----------------------------------------------------------------

  const loadMine = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/watch/posts?scope=mine', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
      }
    } catch (e) { /* ignore */ }
    setLoading(false);
  }, [token]);

  const switchTab = (t: 'watch' | 'report' | 'alerts' | 'circle' | 'mine') => {
    setTab(t);
    if (t === 'watch') refresh('reports');
    if (t === 'alerts') refresh('alert');
    if (t === 'mine') loadMine();
    if (t === 'circle') loadContacts();
  };

  // -------------------------------------------------------------------------

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 md:p-8 space-y-5 shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-emerald-700/10 flex items-center justify-center">
              <Eye className="text-emerald-700" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">SafeWatch</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Neighborhood watch &amp; civic reports</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {me && (
              <button
                onClick={() => { loadStatus(); toast(`Watch points: ${me.trustPoints ?? 0}`); }}
                className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold text-emerald-800 dark:text-emerald-400 py-2 px-3 rounded-xl border border-emerald-200/50 dark:border-zinc-700 hover:bg-emerald-50/50 dark:hover:bg-zinc-800 transition-all"
                title="Your safety-coin balance (tap to refresh)"
              >
                <Coins size={12} /> {me.trustPoints ?? 0}
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/80 dark:bg-zinc-800 flex items-center justify-center text-[#8a8172] dark:text-zinc-400 hover:text-[#3a342a] dark:hover:text-zinc-100 transition-all"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <p className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">
          Neighbours report civic hazards (potholes, streetlights, waterlogging) and safety
          observations. Reports become <b>confirmed</b> after {counts.confirmationsRequired ?? 3} neighbor
          confirmations, then can be marked in progress and resolved. Precise location is only
          ever attached to a watch alert when you explicitly opt in on that tap.
        </p>

        {/* Stat chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['Open', counts.open ?? 0],
            ['Confirmed', counts.confirmed ?? 0],
            ['Resolved', counts.resolved ?? 0],
            ['Live alerts', counts.alerts ?? 0],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/60 p-2.5 text-center">
              <div className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">{value}</div>
              <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {([
            ['watch', 'Watch feed'],
            ['report', 'Report'],
            ['alerts', 'Alerts'],
            ['circle', 'My circle'],
            ['mine', 'My reports'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => switchTab(k)}
              className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
                tab === k
                  ? 'bg-[#3a342a] text-[#f4f1ea] dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ===================== WATCH FEED ===================== */}
        {tab === 'watch' && (
          <div className="space-y-3">
            {loading ? (
              <div className="py-12 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading watch feed…</div>
            ) : posts.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Footprints className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No open reports in the watch.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Report a hazard or raise a watch alert</p>
              </div>
            ) : (
              posts.map((post) => <WatchCard key={post.id} post={post} onConfirm={() => confirmPost(post)} onAck={() => ackPost(post)} onStatus={(s) => setPostStatus(post, s)} />)
            )}
          </div>
        )}

        {/* ===================== REPORT COMPOSER ===================== */}
        {tab === 'report' && (
          <div className="space-y-3 rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/60 p-4">
            <div className="flex items-center gap-2">
              <Hammer size={14} className="text-[#5c5446] dark:text-zinc-300" />
              <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#3a342a] dark:text-zinc-100">Report a hazard or observation</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setForm({ ...form, kind: 'hazard' })}
                className={`font-mono text-[9px] uppercase font-bold tracking-wider py-2 rounded-xl border transition-all ${
                  form.kind === 'hazard'
                    ? 'bg-amber-800 text-white border-amber-800 dark:bg-amber-400 dark:text-zinc-900 dark:border-amber-400'
                    : 'bg-white dark:bg-zinc-800 border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'
                }`}
              >
                Hazard
              </button>
              <button
                onClick={() => setForm({ ...form, kind: 'observation' })}
                className={`font-mono text-[9px] uppercase font-bold tracking-wider py-2 rounded-xl border transition-all ${
                  form.kind === 'observation'
                    ? 'bg-amber-800 text-white border-amber-800 dark:bg-amber-400 dark:text-zinc-900 dark:border-amber-400'
                    : 'bg-white dark:bg-zinc-800 border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'
                }`}
              >
                Observation
              </button>
            </div>

            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
            >
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>

            <input
              value={form.areaLabel}
              onChange={(e) => setForm({ ...form, areaLabel: e.target.value })}
              placeholder="Fuzzy area (e.g. North Beach, around the market)"
              className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What happened? What's needed?"
              rows={3}
              className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
            />
            <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
              Only the area label is broadcast — never your exact address.
            </p>
            <button
              onClick={createPost} disabled={saving}
              className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] disabled:opacity-50 transition-all"
            >
              {saving ? 'Posting…' : form.kind === 'hazard' ? 'Report hazard' : 'Post observation'}
            </button>
          </div>
        )}

        {/* ===================== ALERTS ===================== */}
        {tab === 'alerts' && (
          <div className="space-y-3">
            {/* Raise alert composer */}
            <div className="rounded-2xl border-2 border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-rose-600" />
                <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-rose-700 dark:text-rose-300">Raise a watch alert</span>
              </div>
              <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                "I need eyes on this area." Broadcasts the fuzzy area + message to the watch.
                Precise location is attached <b>only if you opt in</b> below, and is shown only to
                acknowledged watchers.
              </p>
              <input
                value={alertForm.areaLabel}
                onChange={(e) => setAlertForm({ ...alertForm, areaLabel: e.target.value })}
                placeholder="Fuzzy area (e.g. Old town, near the bridge)"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-rose-400"
              />
              <textarea
                value={alertForm.description}
                onChange={(e) => setAlertForm({ ...alertForm, description: e.target.value })}
                placeholder="What do you need eyes on?"
                rows={2}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-rose-400 resize-none"
              />

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    if (alertForm.shareLocation) {
                      setAlertForm({ ...alertForm, shareLocation: false });
                      setGps(null);
                    } else {
                      grabLocation();
                    }
                  }}
                  disabled={gpsBusy}
                  className={`font-mono text-[9px] uppercase font-bold tracking-wider py-2 px-3 rounded-xl border transition-all flex items-center gap-1.5 ${
                    alertForm.shareLocation
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white dark:bg-zinc-800 border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'
                  } disabled:opacity-50`}
                >
                  <LocateFixed size={12} />
                  {gpsBusy ? 'Locating…' : alertForm.shareLocation ? 'Precise location ON (shared this tap)' : 'Share precise location (opt-in)'}
                </button>
                <button
                  onClick={() => setAlertForm({ ...alertForm, notifyCircle: !alertForm.notifyCircle })}
                  className={`font-mono text-[9px] uppercase font-bold tracking-wider py-2 px-3 rounded-xl border transition-all flex items-center gap-1.5 ${
                    alertForm.notifyCircle
                      ? 'bg-[#3a342a] text-[#f4f1ea] border-[#3a342a]'
                      : 'bg-white dark:bg-zinc-800 border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'
                  }`}
                >
                  <Users size={12} />
                  {alertForm.notifyCircle ? 'Notify my watch circle' : 'Notify my watch circle'}
                </button>
              </div>

              <button
                onClick={raiseAlert} disabled={saving}
                className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
              >
                <Bell size={13} /> {saving ? 'Raising alert…' : 'Raise watch alert'}
              </button>
            </div>

            {/* Alert feed */}
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 pt-1">Live watch alerts</div>
            {loading ? (
              <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading alerts…</div>
            ) : posts.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Bell className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No live watch alerts.</p>
              </div>
            ) : (
              posts.map((post) => <WatchCard key={post.id} post={post} onConfirm={() => confirmPost(post)} onAck={() => ackPost(post)} onStatus={(s) => setPostStatus(post, s)} />)
            )}
          </div>
        )}

        {/* ===================== MY CIRCLE ===================== */}
        {tab === 'circle' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/60 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-[#5c5446] dark:text-zinc-300" />
                <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#3a342a] dark:text-zinc-100">Watch circle</span>
              </div>
              <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 leading-relaxed">
                People you trust to check on you. Stored only after you add them, shown only to
                you, and never broadcast — a watch alert simply records how many of them it would
                notify.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  placeholder="Name *"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
                <input
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  placeholder="Phone (optional)"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
                <input
                  value={contactForm.username}
                  onChange={(e) => setContactForm({ ...contactForm, username: e.target.value })}
                  placeholder="Ocean username (optional)"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
                <button
                  onClick={addContact}
                  className="font-mono text-[9px] uppercase font-bold tracking-wider py-2 px-3 rounded-xl bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] transition-all flex items-center justify-center gap-1"
                >
                  <Plus size={12} /> Add contact
                </button>
              </div>
            </div>

            {contacts.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <HeartHandshake className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No circle contacts yet.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Add people you trust</p>
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <motion.div key={c.id} layout className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 p-3 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-emerald-700/10 flex items-center justify-center text-emerald-700">
                      <Phone size={13} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 truncate">{c.name}</div>
                      <div className="text-[10px] font-mono text-[#8a8172] dark:text-zinc-500 truncate">
                        {c.phone || c.username || 'no contact line'}
                      </div>
                    </div>
                    <button
                      onClick={() => removeContact(c)}
                      className="text-[#8a8172] dark:text-zinc-500 hover:text-rose-600 transition-colors"
                      title="Remove contact"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== MY REPORTS ===================== */}
        {tab === 'mine' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Your reports &amp; alerts</div>
              <button
                onClick={loadMine}
                className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 hover:text-[#3a342a] dark:hover:text-zinc-100"
              >
                Refresh
              </button>
            </div>
            {loading ? (
              <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading…</div>
            ) : posts.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <ListChecks className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">Nothing reported by you yet.</p>
              </div>
            ) : (
              posts.map((post) => (
                <WatchCard
                  key={post.id}
                  post={post}
                  onConfirm={() => confirmPost(post)}
                  onAck={() => ackPost(post)}
                  onStatus={(s) => setPostStatus(post, s)}
                  showControls
                />
              ))
            )}
          </div>
        )}

        {/* ===================== AREA WATCH SCORE ===================== */}
        {areaRatings.length > 0 && tab !== 'circle' && (
          <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/60 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-700" />
              <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#3a342a] dark:text-zinc-100">Area watch score</span>
            </div>
            {areaRatings.slice(0, 5).map((a) => (
              <div key={a.area} className="flex items-center gap-3">
                <span className="w-28 truncate text-[10px] text-[#5c5446] dark:text-zinc-300">{a.area}</span>
                <div className="flex-1 h-1.5 rounded-full bg-[#ebdcca]/60 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${a.level === 'well_watched' ? 'bg-emerald-600' : a.level === 'watchful' ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${(a.score / 5) * 100}%` }}
                  />
                </div>
                <span className="w-14 text-right font-mono text-[9px] text-[#8a8172] dark:text-zinc-500">
                  {a.score.toFixed(1)}/5 · {a.reportCount}
                </span>
              </div>
            ))}
            <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 pt-1">
              Score = confirmed + resolved reports per fuzzy area. Higher = better-watched.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watch card
// ---------------------------------------------------------------------------

function WatchCard({
  post, onConfirm, onAck, onStatus, showControls,
}: {
  key?: string | number;
  post: WatchPost;
  onConfirm: () => void;
  onAck: () => void;
  onStatus: (status: string) => void;
  showControls?: boolean;
}) {
  const isOpen = post.kind === 'alert'
    ? post.status === 'active' || post.status === 'acknowledged'
    : post.status !== 'resolved' && post.status !== 'dismissed' && post.status !== 'expired';
  const isMine = post.isMine;

  return (
    <motion.div layout className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${post.kind === 'alert' ? 'bg-rose-500 animate-pulse' : post.kind === 'hazard' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
        <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 flex items-center gap-1">
          {KIND_ICON[post.kind]}
          {post.kind}
        </span>
        <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full uppercase ${STATUS_BADGE[post.status] || 'bg-zinc-100 text-zinc-500'}`}>{post.status.replace('_', ' ')}</span>
        {post.notifyCircle && (
          <span className="font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#8a8172] flex items-center gap-1" title="Reporter asked to notify their circle">
            <Users size={9} /> {post.notifiedContactCount}
          </span>
        )}
      </div>

      <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 mt-2 flex-1">{post.categoryLabel}</h3>
      <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-1">{post.description}</p>

      <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
        <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {post.areaLabel}</span>
        <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(post.createdAt)}</span>
        <span className="flex items-center gap-1"><Users size={11} /> {post.createdByName}</span>
        {post.kind === 'alert' && post.shareLocation && (
          <span className="flex items-center gap-1 text-emerald-600"><LocateFixed size={11} /> precise shared</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {post.kind !== 'alert' && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 self-center">
            <CheckCircle2 size={11} className="inline mr-1" />{post.confirmations} confirmed
          </span>
        )}
        {post.kind === 'alert' && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 self-center">
            <Eye size={11} className="inline mr-1" />{post.ackCount} eyes
          </span>
        )}

        <div className="ml-auto flex gap-2">
          {post.kind === 'alert' && isOpen && !isMine && !post.myAck && (
            <button onClick={onAck} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition-all flex items-center gap-1">
              <Eye size={11} /> Eyes on this
            </button>
          )}
          {post.kind === 'alert' && post.myAck && (
            <span className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center gap-1">
              <CheckCircle2 size={11} /> Acknowledged
            </span>
          )}

          {post.kind !== 'alert' && post.canConfirm && isOpen && (
            <button onClick={onConfirm} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-all flex items-center gap-1">
              <CheckCircle2 size={11} /> Confirm
            </button>
          )}

          {(showControls || isMine) && isOpen && post.kind !== 'alert' && (
            <>
              <button onClick={() => onStatus('in_progress')} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800 hover:bg-sky-200 transition-all flex items-center gap-1">
                <Hammer size={11} /> In progress
              </button>
              <button onClick={() => onStatus('resolved')} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800 hover:bg-emerald-200 transition-all flex items-center gap-1">
                <CheckCircle2 size={11} /> Resolve
              </button>
              {isMine && (
                <button onClick={() => onStatus('dismissed')} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-transparent text-[#8a8172] dark:text-zinc-400 border border-[#ebdcca] dark:border-zinc-700 hover:text-rose-600 transition-all flex items-center gap-1">
                  Dismiss
                </button>
              )}
            </>
          )}
          {post.kind === 'alert' && isMine && isOpen && (
            <button onClick={() => onStatus('resolved')} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-all flex items-center gap-1">
              <CheckCircle2 size={11} /> Resolve alert
            </button>
          )}
        </div>
      </div>

      {post.status === 'resolved' && post.resolvedByName && (
        <div className="mt-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-900/50 px-2.5 py-1.5 text-[10px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
          <CheckCircle2 size={11} />
          Resolved by {post.resolvedByName}{post.resolvedNote ? ` — ${post.resolvedNote}` : ''}
        </div>
      )}
    </motion.div>
  );
}
