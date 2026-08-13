import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2, Plus, X, MapPin, Users, ShieldCheck, Siren, AlertTriangle, CheckCircle2,
  Clock, LifeBuoy, Megaphone, HeartHandshake, LocateFixed, BedDouble, RefreshCw,
  ChevronDown, ChevronUp, DoorOpen,
} from 'lucide-react';

/**
 * Ocean — Safe Shelter & Disaster Watch
 * -------------------------------------
 * A civic-resilience layer that extends the Emergency UX:
 *  - Shelters: a community registry of relief points (schools, community
 *    centres, homes, medical facilities). Fuzzy area label only — exact
 *    addresses are never stored or broadcast.
 *  - "I'm safe here" check-ins that drive live occupancy.
 *  - Request help at a shelter: an SOS-style request. Precise GPS is attached
 *    ONLY if the requester opts in, and is only revealed to the responder.
 *  - Disaster watch: area-based flood / cyclone / fire / heatwave alerts.
 *    Alerts never carry precise coordinates. 3 confirmations promote an alert.
 *  - Safety coins: register, verify, check in, confirm alerts, respond to help.
 *
 * Backed by /api/shelter/* (turtleSafeShelterBackend.ts).
 */

type ShelterType = 'school' | 'community' | 'home' | 'medical' | 'government' | 'other';
type AlertType = 'flood' | 'cyclone' | 'fire' | 'landslide' | 'heatwave' | 'storm' | 'power' | 'other';
type AlertSeverity = 'info' | 'watch' | 'warning' | 'critical';
type HelpStatus = 'open' | 'assisting' | 'resolved';

interface HelpRequest {
  id: string;
  shelterId: string;
  requesterId: string;
  requesterName: string;
  note: string;
  status: HelpStatus;
  responderId?: string;
  responderName?: string;
  createdAt: number;
  resolvedAt?: number;
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  isMine: boolean;
  canRespond: boolean;
}

interface Shelter {
  id: string;
  name: string;
  type: ShelterType;
  areaLabel: string;
  capacity: number;
  amenities: string[];
  open: boolean;
  ownerId: string;
  ownerName?: string;
  isHome: boolean;
  contactNote?: string;
  verified: boolean;
  verifiedCount: number;
  createdAt: number;
  occupancy: number;
  isOwner: boolean;
  checkedInByMe: boolean;
  verifiedByMe: boolean;
  helpRequests: HelpRequest[];
}

interface DisasterAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  areaLabel: string;
  message: string;
  instructions?: string;
  createdById: string;
  createdByName: string;
  confirmed: boolean;
  confirmedCount: number;
  status: 'active' | 'lifted';
  createdAt: number;
  confirmedByMe: boolean;
  isMine: boolean;
}

interface StatusOverview {
  me: { id: string; name: string };
  shelterCount: number;
  openShelterCount: number;
  verifiedShelterCount: number;
  activeAlertCount: number;
  confirmedAlertCount: number;
  myShelterCount: number;
  checkedInShelterIds: string[];
  balance: number;
}

interface SafeShelterViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const SHELTER_TYPE_LABEL: Record<ShelterType, string> = {
  school: 'School', community: 'Community centre', home: 'Home', medical: 'Medical facility',
  government: 'Government', other: 'Other',
};

const AMENITY_LABEL: Record<string, string> = {
  water: 'Water', food: 'Food', power: 'Power', 'first-aid': 'First aid', charging: 'Charging', wifi: 'Wi-Fi', sleeping: 'Sleeping space',
};

const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  flood: 'Flood', cyclone: 'Cyclone', fire: 'Fire', landslide: 'Landslide',
  heatwave: 'Heatwave', storm: 'Storm', power: 'Power outage', other: 'Other',
};

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  info: 'Info', watch: 'Watch', warning: 'Warning', critical: 'Critical',
};

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  info: 'bg-sky-500', watch: 'bg-amber-500', warning: 'bg-orange-500', critical: 'bg-red-600',
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
      { timeout: 8000, maximumAge: 30000 }
    );
  });

export default function SafeShelterView({ token, currentUser, onClose }: SafeShelterViewProps) {
  const [tab, setTab] = useState<'shelters' | 'watch' | 'mine'>('shelters');
  const [status, setStatus] = useState<StatusOverview | null>(null);
  const [shelters, setShelters] = useState<Shelter[]>([]);
  const [alerts, setAlerts] = useState<DisasterAlert[]>([]);
  const [areaFilter, setAreaFilter] = useState('');
  const [loadingShelters, setLoadingShelters] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const [shelterOpen, setShelterOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [helpShelter, setHelpShelter] = useState<Shelter | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [shelterForm, setShelterForm] = useState({
    name: '', type: 'community' as ShelterType, areaLabel: '', capacity: '',
    isHome: false, open: true, amenities: [] as string[], contactNote: '',
  });
  const [alertForm, setAlertForm] = useState({
    type: 'flood' as AlertType, severity: 'watch' as AlertSeverity, areaLabel: '', message: '', instructions: '',
  });
  const [helpForm, setHelpForm] = useState({ note: '', shareLocation: false });
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
      const data = await api('/api/shelter/status', 'GET');
      setStatus(data);
    } catch (e) { /* keep last */ }
  }, [api]);

  const loadShelters = useCallback(async () => {
    setLoadingShelters(true);
    try {
      const data = await api('/api/shelter/list', 'GET');
      setShelters(data.shelters || []);
    } catch (e) { /* ignore */ }
    setLoadingShelters(false);
  }, [api]);

  const loadAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const data = await api('/api/shelter/alerts', 'GET');
      setAlerts(data.alerts || []);
    } catch (e) { /* ignore */ }
    setLoadingAlerts(false);
  }, [api]);

  const loadAll = useCallback(() => {
    loadStatus();
    loadShelters();
    loadAlerts();
  }, [loadStatus, loadShelters, loadAlerts]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Refresh loop so watchers of an active emergency see updates (~15s).
  useEffect(() => {
    const id = window.setInterval(() => { loadStatus(); loadAlerts(); }, 15000);
    return () => window.clearInterval(id);
  }, [loadStatus, loadAlerts]);

  const replaceShelter = (s: Shelter) =>
    setShelters((prev) => prev.map((x) => (x.id === s.id ? s : x)));

  // ── Shelter actions ────────────────────────────────────────────────────────
  const registerShelter = async () => {
    if (shelterForm.name.trim().length < 3) return toast('Shelter name is required (min 3 characters).');
    if (shelterForm.areaLabel.trim().length < 3) return toast('Area label is required (e.g. "North Beach, near the school").');
    setSending(true);
    try {
      const data = await api('/api/shelter', 'POST', {
        ...shelterForm,
        capacity: Number(shelterForm.capacity) || 0,
      });
      setShelterOpen(false);
      toast(`Shelter "${data.shelter.name}" registered. +10 safety coins.`);
      setShelterForm({ name: '', type: 'community', areaLabel: '', capacity: '', isHome: false, open: true, amenities: [], contactNote: '' });
      loadAll();
    } catch (e: any) { toast(e.message || 'Could not register shelter.', 'destructive'); }
    finally { setSending(false); }
  };

  const verifyShelter = async (s: Shelter) => {
    try {
      const data = await api(`/api/shelter/${s.id}/verify`, 'POST');
      replaceShelter(data.shelter);
      toast(data.shelter.verified ? 'Shelter verified! Its owner earned coins.' : 'Shelter verified. One more nearby confirmation marks it verified.');
      loadStatus();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const toggleCheckin = async (s: Shelter) => {
    try {
      const data = await api(`/api/shelter/${s.id}/checkin`, 'POST');
      replaceShelter(data.shelter);
      toast(data.action === 'checked-in'
        ? `Marked safe here.${data.reward ? ' +' + data.reward + ' safety coins.' : ''}`
        : 'Checked out.');
      loadStatus();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const updateShelter = async (s: Shelter, patch: { open?: boolean; capacity?: number }) => {
    try {
      const data = await api(`/api/shelter/${s.id}/update`, 'POST', patch);
      replaceShelter(data.shelter);
      toast('Shelter updated.');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const requestHelp = async () => {
    if (!helpShelter) return;
    if (helpForm.note.trim().length < 5) return toast('Describe the help you need (min 5 characters).');
    setSending(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (helpForm.shareLocation) {
        const c = await getCoords();
        if (c) { lat = c.lat; lng = c.lng; }
      }
      await api(`/api/shelter/${helpShelter.id}/help`, 'POST', {
        note: helpForm.note.trim(),
        shareLocation: !!helpForm.shareLocation,
        lat,
        lng,
      });
      toast(helpForm.shareLocation
        ? 'Help requested — responders can see your precise location.'
        : 'Help requested at this shelter.');
      setHelpShelter(null);
      setHelpForm({ note: '', shareLocation: false });
      loadShelters();
    } catch (e: any) { toast(e.message || 'Could not request help.', 'destructive'); }
    finally { setSending(false); }
  };

  const respondHelp = async (req: HelpRequest) => {
    try {
      await api(`/api/shelter/help/${req.id}/respond`, 'POST');
      toast('You are on the way. +20 safety coins.');
      loadShelters();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const resolveHelp = async (req: HelpRequest) => {
    try {
      await api(`/api/shelter/help/${req.id}/resolve`, 'POST');
      toast('Help request resolved.');
      loadShelters();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const reportShelter = async (s: Shelter) => {
    try {
      await api(`/api/shelter/${s.id}/report`, 'POST', { reason: 'fake' });
      toast('Reported. Unsafe or fake shelters are hidden after 3 reports.');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  // ── Disaster watch actions ─────────────────────────────────────────────────
  const broadcastAlert = async () => {
    if (alertForm.areaLabel.trim().length < 3) return toast('Area label is required (e.g. "River basin near the bridge").');
    if (alertForm.message.trim().length < 10) return toast('A short message is required (min 10 characters).');
    setSending(true);
    try {
      await api('/api/shelter/alerts', 'POST', { ...alertForm });
      setAlertOpen(false);
      toast('Disaster alert broadcast to the community.');
      setAlertForm({ type: 'flood', severity: 'watch', areaLabel: '', message: '', instructions: '' });
      loadAlerts();
      loadStatus();
    } catch (e: any) { toast(e.message || 'Could not broadcast.', 'destructive'); }
    finally { setSending(false); }
  };

  const confirmAlert = async (a: DisasterAlert) => {
    try {
      const data = await api(`/api/shelter/alerts/${a.id}/confirm`, 'POST');
      toast(data.promoted ? 'Alert confirmed by the community. +10 coins.' : 'Confirmed. 3 confirmations promote an alert. +10 coins.');
      loadAlerts();
      loadStatus();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const liftAlert = async (a: DisasterAlert) => {
    try {
      await api(`/api/shelter/alerts/${a.id}/lift`, 'POST');
      toast('Alert lifted — all clear.');
      loadAlerts();
      loadStatus();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const reportAlert = async (a: DisasterAlert) => {
    try {
      await api(`/api/shelter/alerts/${a.id}/report`, 'POST', { reason: 'false_alarm' });
      toast('Reported. False alarms are lifted after 3 reports.');
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const myShelters = shelters.filter((s) => s.isOwner);
  const myCheckins = shelters.filter((s) => s.checkedInByMe);

  const inputCls =
    'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400';

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-9 h-9 rounded-full bg-amber-600/10 flex items-center justify-center">
            <Building2 className="text-amber-700 dark:text-amber-400" size={18} />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Safe Shelter</h2>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
              Shelters · disaster watch · civic resilience
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
          <DoorOpen className="mx-auto text-emerald-600" size={15} />
          <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.openShelterCount ?? 0}</div>
          <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">open shelters</div>
        </div>
        <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
          <Siren className={`mx-auto text-rose-600 ${(status?.activeAlertCount || 0) > 0 ? 'animate-pulse' : ''}`} size={15} />
          <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.activeAlertCount ?? 0}</div>
          <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">active alerts</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          ['shelters', 'Shelters'],
          ['watch', 'Disaster Watch'],
          ['mine', 'My Place'],
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

      {/* ── SHELTERS TAB ─────────────────────────────────────────────────── */}
      {tab === 'shelters' && (
        <div className="space-y-4">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  placeholder="Filter by area label…"
                  className={inputCls}
                />
                <button
                  onClick={() => setShelterOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b] whitespace-nowrap"
                >
                  <Plus size={12} /> Register
                </button>
              </div>
            </div>
            <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 leading-relaxed">
              Community shelters &amp; relief points. Only a fuzzy area label is shown — never an exact address.
              Tap <b>Request help here</b> for an SOS-style alert at a shelter; your precise location is only shared if you opt in.
            </p>
          </div>

          {loadingShelters ? (
            <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading shelters…</div>
          ) : shelters.length === 0 ? (
            <div className="py-14 text-center space-y-2">
              <Building2 className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
              <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No shelters listed yet.</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Offer your place or a community centre</p>
            </div>
          ) : (
            <div className="space-y-3">
              {shelters
                .filter((s) => s.areaLabel.toLowerCase().includes(areaFilter.trim().toLowerCase()))
                .map((s) => (
                  <motion.div key={s.id} layout className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${s.open ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                      <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1">{s.name}</h3>
                      {s.verified && (
                        <span className="flex items-center gap-1 text-[8px] font-mono uppercase bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                          <ShieldCheck size={10} /> Verified
                        </span>
                      )}
                      {s.isHome && (
                        <span className="text-[8px] font-mono uppercase bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 px-1.5 py-0.5 rounded-full">Home</span>
                      )}
                      {s.isOwner && (
                        <span className="text-[8px] font-mono uppercase bg-[#ebdcca]/40 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-300 px-1.5 py-0.5 rounded-full">Yours</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
                      <span className="capitalize">{SHELTER_TYPE_LABEL[s.type] || s.type}</span>
                      <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {s.areaLabel}</span>
                      <span className="flex items-center gap-1"><Users size={11} /> {s.capacity > 0 ? `${s.occupancy}/${s.capacity}` : `${s.occupancy} sheltered`}</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(s.createdAt)}</span>
                    </div>
                    {s.amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {s.amenities.map((a) => (
                          <span key={a} className="text-[9px] bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 px-2 py-0.5 rounded-full">{AMENITY_LABEL[a] || a}</span>
                        ))}
                      </div>
                    )}
                    {s.contactNote && (
                      <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 mt-2 flex items-center gap-1">
                        <LifeBuoy size={11} className="text-[#8a8172]" /> {s.contactNote}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-3">
                      {s.checkedInByMe ? (
                        <button onClick={() => toggleCheckin(s)} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#ebdcca]/50 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/80 transition-all">
                          Checked in — check out
                        </button>
                      ) : (
                        <button onClick={() => toggleCheckin(s)} className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white dark:bg-emerald-600 hover:bg-emerald-800 transition-all">
                          <CheckCircle2 size={11} /> I'm safe here
                        </button>
                      )}
                      {!s.isOwner && (
                        <button
                          onClick={() => verifyShelter(s)}
                          disabled={s.verifiedByMe}
                          className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 disabled:opacity-40 transition-all"
                        >
                          <ShieldCheck size={11} /> {s.verifiedByMe ? 'Verified' : 'Verify'}
                        </button>
                      )}
                      <button
                        onClick={() => setHelpShelter(s)}
                        className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition-all"
                      >
                        <Siren size={11} /> Request help here
                      </button>
                      <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)} className="ml-auto text-[#8a8172] dark:text-zinc-500 hover:text-[#3a342a] transition-colors" title="Help requests">
                        {expandedId === s.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>

                    {expandedId === s.id && (
                      <div className="mt-3 border-t border-[#ebdcca]/60 dark:border-zinc-800 pt-3 space-y-2">
                        {s.helpRequests.length === 0 ? (
                          <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 font-mono uppercase tracking-wider">No help requests at this shelter yet.</p>
                        ) : (
                          s.helpRequests.slice(0, 8).map((r) => (
                            <div key={r.id} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 text-xs space-y-1">
                              <div className="flex justify-between">
                                <span className="font-bold text-[#3a342a] dark:text-zinc-100">{r.requesterName}</span>
                                <span className={`font-mono text-[9px] uppercase px-1.5 py-0.5 rounded-full ${r.status === 'open' ? 'bg-rose-50 text-rose-600' : r.status === 'assisting' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-600'}`}>{r.status}</span>
                              </div>
                              <p className="text-[#5c5446] dark:text-zinc-300">{r.note}</p>
                              <div className="flex items-center gap-2 pt-1">
                                {r.canRespond && (
                                  <button onClick={() => respondHelp(r)} className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">
                                    <LocateFixed size={10} /> On my way
                                  </button>
                                )}
                                {r.status !== 'resolved' && (r.isMine || r.responderId === currentUser?.id) && (
                                  <button onClick={() => resolveHelp(r)} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-transparent text-emerald-700 dark:text-emerald-400 border border-emerald-300/50 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
                                    Resolve
                                  </button>
                                )}
                                {r.shareLocation && <span className="ml-auto text-[9px] font-mono text-[#8a8172]">precise location shared</span>}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── DISASTER WATCH TAB ──────────────────────────────────────────── */}
      {tab === 'watch' && (
        <div className="space-y-4">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-2 font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
                  <Megaphone size={14} className="text-amber-700 dark:text-amber-400" /> Disaster watch
                </h3>
                <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 mt-1">
                  Area-based early warnings (flood, cyclone, fire, heatwave…). Alerts carry only a fuzzy area — never precise coordinates.
                  Three independent confirmations promote an alert.
                </p>
              </div>
              <button
                onClick={() => setAlertOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-mono uppercase font-bold hover:bg-rose-500 whitespace-nowrap"
              >
                <Plus size={12} /> Broadcast
              </button>
            </div>
          </div>

          {loadingAlerts ? (
            <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading alerts…</div>
          ) : alerts.length === 0 ? (
            <div className="py-14 text-center space-y-2">
              <ShieldCheck className="mx-auto text-emerald-600" size={26} />
              <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No active alerts in the community.</p>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Stay aware, stay safe</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((a) => (
                <motion.div key={a.id} layout className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_DOT[a.severity]} ${a.severity === 'critical' ? 'animate-pulse' : ''}`} />
                    <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1">
                      {ALERT_TYPE_LABEL[a.type] || a.type}
                    </h3>
                    <span className="font-mono text-[9px] px-2 py-0.5 rounded-full bg-[#ebdcca]/40 dark:bg-zinc-800 capitalize text-[#5c5446] dark:text-zinc-300">{SEVERITY_LABEL[a.severity]}</span>
                    {a.confirmed && (
                      <span className="flex items-center gap-1 text-[8px] font-mono uppercase bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                        <CheckCircle2 size={10} /> Confirmed
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
                    <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {a.areaLabel}</span>
                    <span className="flex items-center gap-1"><Users size={11} /> {a.confirmedCount} confirm</span>
                    <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(a.createdAt)}</span>
                  </div>
                  <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-2">{a.message}</p>
                  {a.instructions && (
                    <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 mt-1 flex items-center gap-1">
                      <AlertTriangle size={11} className="text-amber-600" /> {a.instructions}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {!a.isMine && !a.confirmedByMe && a.status === 'active' && (
                      <button onClick={() => confirmAlert(a)} className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900 hover:bg-amber-900 transition-all">
                        <CheckCircle2 size={11} /> Confirm
                      </button>
                    )}
                    {(a.isMine || a.confirmedByMe) && a.status === 'active' && (
                      <button onClick={() => liftAlert(a)} className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-all">
                        <CheckCircle2 size={11} /> All clear
                      </button>
                    )}
                    <button onClick={() => reportAlert(a)} className="ml-auto text-[#8a8172] dark:text-zinc-500 hover:text-red-600 transition-colors" title="Report false alarm">
                      <AlertTriangle size={14} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MY PLACE TAB ────────────────────────────────────────────────── */}
      {tab === 'mine' && (
        <div className="space-y-4">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-4">
            <div>
              <h3 className="flex items-center gap-2 font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
                <BedDouble size={14} className="text-[#5c5446] dark:text-zinc-400" /> Shelters I offer
              </h3>
              <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 mt-1">
                {status?.myShelterCount ?? 0} shelter(s) · {myCheckins.length} place(s) I'm currently checked into.
              </p>
            </div>

            {myShelters.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <Building2 className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">You haven't registered a shelter yet.</p>
                <button
                  onClick={() => setShelterOpen(true)}
                  className="mx-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3a342a] text-[#f4f1ea] text-[10px] font-mono uppercase font-bold hover:bg-[#52493b]"
                >
                  <Plus size={12} /> Register a shelter
                </button>
              </div>
            ) : (
              myShelters.map((s) => (
                <div key={s.id} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${s.open ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                      <span className="font-bold text-sm text-[#3a342a] dark:text-zinc-100">{s.name}</span>
                      {s.verified && <ShieldCheck size={13} className="text-emerald-600" />}
                    </div>
                    <span className="font-mono text-[10px] text-[#8a8172]">{s.occupancy}/{s.capacity > 0 ? s.capacity : '∞'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => updateShelter(s, { open: !s.open })}
                      className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg transition-all ${
                        s.open
                          ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                          : 'bg-[#ebdcca]/50 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300'
                      }`}
                    >
                      {s.open ? 'Accepting people' : 'Mark open'}
                    </button>
                    <button
                      onClick={() => updateShelter(s, { capacity: s.capacity > 0 ? 0 : 100 })}
                      className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70"
                    >
                      {s.capacity > 0 ? 'Capacity unknown' : 'Set capacity 100'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-3xl p-5 space-y-3">
            <h3 className="flex items-center gap-2 font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100">
              <CheckCircle2 size={14} className="text-emerald-600" /> Places I've checked into
            </h3>
            {myCheckins.length === 0 ? (
              <p className="text-[10px] text-[#8a8172] dark:text-zinc-500 font-mono uppercase tracking-wider">
                No active check-ins. Tap "I'm safe here" on a shelter.
              </p>
            ) : (
              myCheckins.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <div>
                      <p className="text-sm font-bold text-[#3a342a] dark:text-zinc-100">{s.name}</p>
                      <p className="text-[10px] text-[#8a8172]">{s.areaLabel}</p>
                    </div>
                  </div>
                  <button onClick={() => toggleCheckin(s)} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#ebdcca]/50 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/80">
                    Check out
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── REGISTER SHELTER MODAL ─────────────────────────────────────── */}
      <AnimatePresence>
        {shelterOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShelterOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <Building2 className="text-amber-700 dark:text-amber-400" size={16} /> Register a shelter
                </h3>
                <button onClick={() => setShelterOpen(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>

              <input
                value={shelterForm.name} onChange={(e) => setShelterForm({ ...shelterForm, name: e.target.value })}
                placeholder="Name (e.g. North Beach Community Hall)"
                className={inputCls}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={shelterForm.type} onChange={(e) => setShelterForm({ ...shelterForm, type: e.target.value as ShelterType })}
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm"
                >
                  {(Object.keys(SHELTER_TYPE_LABEL) as ShelterType[]).map((t) => (
                    <option key={t} value={t}>{SHELTER_TYPE_LABEL[t]}</option>
                  ))}
                </select>
                <input
                  type="number" value={shelterForm.capacity}
                  onChange={(e) => setShelterForm({ ...shelterForm, capacity: e.target.value })}
                  placeholder="Capacity (people)"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400"
                />
              </div>
              <input
                value={shelterForm.areaLabel} onChange={(e) => setShelterForm({ ...shelterForm, areaLabel: e.target.value })}
                placeholder="Area label (e.g. near the riverside school)"
                className={inputCls}
              />
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 -mt-1">Only this fuzzy area is shown publicly — never your exact address.</p>
              <input
                value={shelterForm.contactNote} onChange={(e) => setShelterForm({ ...shelterForm, contactNote: e.target.value })}
                placeholder="Contact note (optional, e.g. 'Ask for Rina at the gate')"
                className={inputCls}
              />

              <div>
                <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 mb-1.5">Amenities</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(AMENITY_LABEL).map(([k, label]) => {
                    const on = shelterForm.amenities.includes(k);
                    return (
                      <button
                        key={k}
                        onClick={() => setShelterForm({
                          ...shelterForm,
                          amenities: on ? shelterForm.amenities.filter((a) => a !== k) : [...shelterForm.amenities, k],
                        })}
                        className={`font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-2.5 rounded-full transition-all ${
                          on ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900' : 'bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-[#5c5446] dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={shelterForm.isHome}
                  onChange={(e) => setShelterForm({ ...shelterForm, isHome: e.target.checked })}
                  className="accent-amber-600"
                />
                This is my home — I'm offering shelter here
              </label>
              <label className="flex items-center gap-2 text-xs text-[#5c5446] dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={shelterForm.open}
                  onChange={(e) => setShelterForm({ ...shelterForm, open: e.target.checked })}
                  className="accent-amber-600"
                />
                Currently accepting people
              </label>

              <button
                onClick={registerShelter} disabled={sending}
                className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] disabled:opacity-50 transition-all"
              >
                {sending ? 'Registering…' : 'Register shelter (+10 coins)'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BROADCAST ALERT MODAL ───────────────────────────────────────── */}
      <AnimatePresence>
        {alertOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setAlertOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <Megaphone className="text-rose-600" size={16} /> Broadcast disaster alert
                </h3>
                <button onClick={() => setAlertOpen(false)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={alertForm.type} onChange={(e) => setAlertForm({ ...alertForm, type: e.target.value as AlertType })}
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm capitalize"
                >
                  {(Object.keys(ALERT_TYPE_LABEL) as AlertType[]).map((t) => (
                    <option key={t} value={t}>{ALERT_TYPE_LABEL[t]}</option>
                  ))}
                </select>
                <select
                  value={alertForm.severity} onChange={(e) => setAlertForm({ ...alertForm, severity: e.target.value as AlertSeverity })}
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm capitalize"
                >
                  {(Object.keys(SEVERITY_LABEL) as AlertSeverity[]).map((s) => (
                    <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
                  ))}
                </select>
              </div>
              <input
                value={alertForm.areaLabel} onChange={(e) => setAlertForm({ ...alertForm, areaLabel: e.target.value })}
                placeholder="Area label (e.g. River basin near the bridge)"
                className={inputCls}
              />
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 -mt-1">Alerts carry only a fuzzy area — precise coordinates are never broadcast.</p>
              <textarea
                value={alertForm.message} onChange={(e) => setAlertForm({ ...alertForm, message: e.target.value })}
                placeholder="What is happening?"
                rows={3}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
              />
              <textarea
                value={alertForm.instructions} onChange={(e) => setAlertForm({ ...alertForm, instructions: e.target.value })}
                placeholder="Safety instructions (optional, e.g. 'Move to higher ground')"
                rows={2}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
              />
              <button
                onClick={broadcastAlert} disabled={sending}
                className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50 transition-all"
              >
                {sending ? 'Broadcasting…' : 'Broadcast alert'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── REQUEST HELP MODAL ──────────────────────────────────────────── */}
      <AnimatePresence>
        {helpShelter && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setHelpShelter(null)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
                  <Siren className="text-rose-600" size={16} /> Request help at {helpShelter.name}
                </h3>
                <button onClick={() => setHelpShelter(null)} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
              </div>
              <p className="text-[10px] text-[#8a8172] dark:text-zinc-500">
                This is an SOS-style alert to the community. Responders see it in this shelter's card.
              </p>
              <textarea
                value={helpForm.note} onChange={(e) => setHelpForm({ ...helpForm, note: e.target.value })}
                placeholder="What help do you need?"
                rows={3}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400 resize-none"
              />
              <label className="flex items-center gap-2 text-xs text-[#5c5446] dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={helpForm.shareLocation}
                  onChange={(e) => setHelpForm({ ...helpForm, shareLocation: e.target.checked })}
                  className="accent-rose-600"
                />
                Share my precise location with the responder
              </label>
              <p className="text-[9px] text-[#8a8172] dark:text-zinc-500 -mt-1">
                Only ticked if you want responders to know exactly where you are. Shared only with whoever responds.
              </p>
              <button
                onClick={requestHelp} disabled={sending}
                className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50 transition-all"
              >
                {sending ? 'Sending…' : 'Request help'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-center">
        <button
          onClick={loadAll}
          className="flex items-center gap-1.5 font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70 transition-all"
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
    </div>
  );
}
