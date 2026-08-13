import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Waves, Droplets, MapPin, Siren, Plus, X, Users, CheckCircle2, Clock,
  LocateFixed, Coins, AlertTriangle, ShieldCheck, HeartHandshake, LifeBuoy, Footprints,
} from 'lucide-react';

/**
 * Ocean — Flood Depth Mapper (FEATURE 127 — Safety & Civic Resilience)
 * ---------------------------------------------------------------------
 * Extends the emergency UX (EmergencyView covers community emergency pools; this
 * covers the flood-observability slice): community flood-depth reports, help
 * escalations, neighbour confirmation, a flood-prone spots registry, "I'm safe
 * here" check-ins and per-area risk zones.
 *
 * Privacy (rule 4): the fuzzy area label is always what is broadcast. Precise GPS
 * is attached ONLY when you explicitly opt in on a single report tap, and is
 * revealed only to the report author and (for help requests) acknowledged
 * responders. No emergency contacts are stored by this module.
 *
 * Backed by /api/flood/* (turtleFloodDepthMapperBackend.ts).
 */

type Kind = 'depth' | 'help' | 'safe';
type RiskLevel = 'low' | 'moderate' | 'high' | 'severe';

interface FloodReport {
  id: string;
  kind: Kind;
  kindLabel: string;
  depthCm: number;
  areaLabel: string;
  note: string;
  createdById: string;
  createdByName: string;
  status: 'active' | 'confirmed' | 'resolved' | 'expired';
  confirmations: number;
  confirmedByMe: boolean;
  ackCount: number;
  myAck: { byUserId: string; byName: string; type: string } | null;
  shareLocation: boolean;
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
  resolvedByName?: string;
  isMine: boolean;
  canConfirm: boolean;
  canAck: boolean;
  lat?: number;
  lng?: number;
}

interface FloodSpot {
  id: string;
  areaLabel: string;
  typicalDepthCm: number;
  riskLevel: RiskLevel;
  riskLabel: string;
  note: string;
  createdById: string;
  createdByName: string;
  confirmations: number;
  confirmedByMe: boolean;
  createdAt: number;
  isMine: boolean;
}

interface RiskZone {
  area: string;
  reportCount: number;
  maxDepthCm: number;
  helpRequests: number;
  riskLevel: RiskLevel;
}

interface FloodDepthMapperViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const RISK_BADGE: Record<RiskLevel, string> = {
  low: 'bg-emerald-50 text-emerald-600',
  moderate: 'bg-amber-50 text-amber-600',
  high: 'bg-orange-50 text-orange-600',
  severe: 'bg-rose-50 text-rose-600',
};

const RISK_BAR: Record<RiskLevel, string> = {
  low: 'bg-emerald-500',
  moderate: 'bg-amber-500',
  high: 'bg-orange-500',
  severe: 'bg-rose-500',
};

const KIND_BADGE: Record<Kind, string> = {
  depth: 'bg-sky-50 text-sky-600',
  help: 'bg-rose-50 text-rose-500',
  safe: 'bg-emerald-50 text-emerald-600',
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function depthLabel(cm: number): string {
  if (cm <= 0) return '—';
  if (cm < 15) return `${cm}cm · ankle`;
  if (cm < 40) return `${cm}cm · knee`;
  if (cm < 100) return `${cm}cm · waist`;
  if (cm < 150) return `${cm}cm · chest`;
  return `${cm}cm · over head`;
}

export default function FloodDepthMapperView({ token, currentUser, onClose }: FloodDepthMapperViewProps) {
  const [tab, setTab] = useState<'map' | 'report' | 'spots' | 'mine'>('map');
  const [counts, setCounts] = useState<any>({});
  const [riskZones, setRiskZones] = useState<RiskZone[]>([]);
  const [me, setMe] = useState<any>(null);
  const [reports, setReports] = useState<FloodReport[]>([]);
  const [spots, setSpots] = useState<FloodSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmationsRequired, setConfirmationsRequired] = useState(3);
  const [coinRewards, setCoinRewards] = useState<any>({});

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

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/flood/overview', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts || {});
        setRiskZones(data.riskZones || []);
        setMe(data.me || null);
        if (typeof data.confirmationsRequired === 'number') setConfirmationsRequired(data.confirmationsRequired);
        setCoinRewards(data.coinRewards || {});
      }
    } catch (e) { /* ignore */ }
  }, [token]);

  const loadReports = useCallback(async (scope = 'active', kind = '') => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (scope) q.set('scope', scope);
      if (kind) q.set('kind', kind);
      const res = await fetch(`/api/flood/reports?${q.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (e) {
      console.error('Failed to load flood reports:', e);
    }
    setLoading(false);
  }, [token]);

  const loadSpots = useCallback(async () => {
    try {
      const res = await fetch('/api/flood/spots', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSpots(data.spots || []);
      }
    } catch (e) { /* ignore */ }
  }, [token]);

  const refresh = useCallback(async () => {
    await Promise.all([loadOverview(), loadReports('active')]);
  }, [loadOverview, loadReports]);

  useEffect(() => { refresh(); }, [refresh]);

  // --- report composer ------------------------------------------------------

  const [form, setForm] = useState({
    kind: 'depth' as Kind,
    depthCm: '',
    areaLabel: '',
    note: '',
    shareLocation: false,
  });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);

  const grabLocation = () => {
    if (!('geolocation' in navigator)) return toast('Geolocation is not available on this device.', 'destructive');
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setForm((f) => ({ ...f, shareLocation: true }));
        setGpsBusy(false);
        toast('Precise location captured — sent with this report only.');
      },
      () => {
        setGpsBusy(false);
        toast('Could not get location. The report will carry the area label only.', 'destructive');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const submitReport = async () => {
    if (form.areaLabel.trim().length < 3) return toast('A fuzzy area label is required.');
    if (form.kind === 'depth' && !Number(form.depthCm)) return toast('Water depth is required for a depth report.');
    if (form.kind === 'help' && form.note.trim().length < 5) return toast('Describe the situation (at least 5 characters).');
    setSaving(true);
    try {
      await api('/api/flood/reports', 'POST', {
        kind: form.kind,
        depthCm: form.kind === 'depth' ? Number(form.depthCm) : undefined,
        areaLabel: form.areaLabel.trim(),
        note: form.note.trim(),
        shareLocation: form.shareLocation,
        lat: form.shareLocation && gps ? gps.lat : undefined,
        lng: form.shareLocation && gps ? gps.lng : undefined,
      });
      toast(form.kind === 'help' ? 'Help request raised to the flood board.' : form.kind === 'safe' ? 'Good news posted — water receded.' : 'Water depth report posted.');
      setForm({ kind: 'depth', depthCm: '', areaLabel: '', note: '', shareLocation: false });
      setGps(null);
      refresh();
    } catch (e: any) {
      toast(e.message, 'destructive');
    } finally { setSaving(false); }
  };

  // --- "I'm safe here" check-in ---------------------------------------------

  const [checkinArea, setCheckinArea] = useState('');
  const [checkinBusy, setCheckinBusy] = useState(false);

  const checkin = async () => {
    if (checkinArea.trim().length < 3) return toast('Enter the fuzzy area you are safe in.');
    setCheckinBusy(true);
    try {
      const data = await api('/api/flood/checkin', 'POST', { areaLabel: checkinArea.trim() });
      toast(
        data.awarded
          ? `Marked safe in ${checkinArea.trim()}. +${data.coinReward ?? 10} safety coins.`
          : `Marked safe in ${checkinArea.trim()} (coin reward on cooldown).`
      );
      setCheckinArea('');
      loadOverview();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setCheckinBusy(false); }
  };

  // --- actions ---------------------------------------------------------------

  const confirmReport = async (r: FloodReport) => {
    try {
      const data = await api(`/api/flood/reports/${r.id}/confirm`, 'POST');
      toast(data.promoted ? 'Confirmed — this reading is now community-verified.' : 'Confirmed. Thanks for verifying.');
      refresh();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const ackReport = async (r: FloodReport) => {
    try {
      await api(`/api/flood/reports/${r.id}/ack`, 'POST', { type: 'on_my_way' });
      toast('Responding — the requester can see you are on the way.');
      refresh();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const resolveReport = async (r: FloodReport) => {
    try {
      await api(`/api/flood/reports/${r.id}/resolve`, 'POST');
      toast('Marked resolved.');
      refresh();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  // --- spots ------------------------------------------------------------------

  const [spotForm, setSpotForm] = useState({ areaLabel: '', typicalDepthCm: '', riskLevel: 'moderate' as RiskLevel, note: '' });

  const addSpot = async () => {
    if (spotForm.areaLabel.trim().length < 3) return toast('A fuzzy area label is required.');
    if (!Number(spotForm.typicalDepthCm)) return toast('Typical water depth is required.');
    setSaving(true);
    try {
      await api('/api/flood/spots', 'POST', {
        areaLabel: spotForm.areaLabel.trim(),
        typicalDepthCm: Number(spotForm.typicalDepthCm),
        riskLevel: spotForm.riskLevel,
        note: spotForm.note.trim(),
      });
      toast('Flood-prone spot added.');
      setSpotForm({ areaLabel: '', typicalDepthCm: '', riskLevel: 'moderate', note: '' });
      loadSpots();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setSaving(false); }
  };

  const confirmSpot = async (s: FloodSpot) => {
    try {
      await api(`/api/flood/spots/${s.id}/confirm`, 'POST');
      toast('Spot corroborated.');
      loadSpots();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  // --- mine --------------------------------------------------------------------

  const loadMine = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/flood/reports?scope=mine', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (e) { /* ignore */ }
    setLoading(false);
  }, [token]);

  const switchTab = (t: 'map' | 'report' | 'spots' | 'mine') => {
    setTab(t);
    if (t === 'map') refresh();
    if (t === 'spots') loadSpots();
    if (t === 'mine') loadMine();
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="bg-[#fcfaf4] dark:bg-zinc-900 border-2 border-[#ebdcca] dark:border-zinc-800 rounded-[2rem] p-6 md:p-8 space-y-5 shadow-xs">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-sky-700/10 flex items-center justify-center">
              <Waves className="text-sky-700" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Flood Depth Mapper</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Community flood map · civic resilience</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {me && (
              <button
                onClick={() => { loadOverview(); toast(`Flood points: ${me.balance ?? 0}`); }}
                className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold text-sky-800 dark:text-sky-400 py-2 px-3 rounded-xl border border-sky-200/50 dark:border-zinc-700 hover:bg-sky-50/50 dark:hover:bg-zinc-800 transition-all"
                title="Your safety-coin balance (tap to refresh)"
              >
                <Coins size={12} /> {me.balance ?? 0}
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
          Neighbours report water depth where they are — <b>never your home address</b>. A reading
          becomes <b>confirmed</b> after {confirmationsRequired} neighbour confirmations. Rising water or
          a <b>needs help</b> request lights up the area risk zone. Precise GPS is attached only when you
          explicitly opt in on a single report.
        </p>

        {/* Stat chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['Depth reports', counts.activeReports ?? 0],
            ['Need help', counts.helpRequests ?? 0],
            ['Confirmed', counts.confirmed ?? 0],
            ['Resolved', counts.resolved ?? 0],
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
            ['map', 'Flood map'],
            ['report', 'Report'],
            ['spots', 'Flood spots'],
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

        {/* ===================== FLOOD MAP ===================== */}
        {tab === 'map' && (
          <div className="space-y-4">
            {/* I'm safe here check-in */}
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/60 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <HeartHandshake size={14} className="text-emerald-700" />
                <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#3a342a] dark:text-zinc-100">I'm safe here</span>
                {me && (
                  <span className="ml-auto font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                    {me.checkinsToday ?? 0} today
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={checkinArea}
                  onChange={(e) => setCheckinArea(e.target.value)}
                  placeholder="Fuzzy area you are safe in (e.g. Old town, flat side)"
                  className="flex-1 bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-emerald-400"
                />
                <button
                  onClick={checkin} disabled={checkinBusy}
                  className="font-mono text-[9px] uppercase font-bold tracking-wider py-2 px-3 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition-all flex items-center gap-1"
                >
                  <ShieldCheck size={12} /> Check in
                </button>
              </div>
              <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
                Fuzzy area only — never your exact position. {coinRewards.checkin ?? 10} coins, once per 30 min.
              </p>
            </div>

            {/* Risk zones */}
            {riskZones.length > 0 && (
              <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/60 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-600" />
                  <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#3a342a] dark:text-zinc-100">Area risk zones</span>
                </div>
                {riskZones.map((z) => (
                  <div key={z.area} className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${RISK_BAR[z.riskLevel] || 'bg-emerald-500'}`} />
                    <span className="w-32 truncate text-[10px] text-[#5c5446] dark:text-zinc-300">{z.area}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-[#ebdcca]/60 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${RISK_BAR[z.riskLevel] || 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, (z.maxDepthCm / 150) * 100)}%` }}
                      />
                    </div>
                    <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${RISK_BADGE[z.riskLevel] || 'bg-emerald-50 text-emerald-600'}`}>
                      {z.riskLevel}
                    </span>
                    <span className="w-16 text-right font-mono text-[9px] text-[#8a8172] dark:text-zinc-500">
                      {z.maxDepthCm > 0 ? `${z.maxDepthCm}cm` : '—'}
                    </span>
                  </div>
                ))}
                <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 pt-1">
                  Severe = live help request or ≥150cm depth. Derives from live reports only.
                </p>
              </div>
            )}

            {/* Active report feed */}
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 pt-1">Live flood reports</div>
            {loading ? (
              <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading flood map…</div>
            ) : reports.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Droplets className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No live flood reports.</p>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Report water depth or raise a help request</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((r) => (
                  <FloodCard
                    key={r.id}
                    report={r}
                    onConfirm={() => confirmReport(r)}
                    onAck={() => ackReport(r)}
                    onResolve={() => resolveReport(r)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== REPORT COMPOSER ===================== */}
        {tab === 'report' && (
          <div className="space-y-3 rounded-2xl border-2 border-sky-200/70 dark:border-sky-900/50 bg-white/50 dark:bg-zinc-900/60 p-4">
            <div className="flex items-center gap-2">
              <Droplets size={14} className="text-sky-700" />
              <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#3a342a] dark:text-zinc-100">Report a flood update</span>
            </div>
            <p className="text-[10px] text-[#5c5446] dark:text-zinc-300 leading-relaxed">
              An explicit, per-tap action. The fuzzy area + message are broadcast; precise location is
              attached <b>only if you opt in</b> below and is shown only to the reporter and acknowledged
              responders. Never enter floodwater to take a reading.
            </p>

            {/* Kind selector */}
            <div className="grid grid-cols-3 gap-2">
              {([
                ['depth', 'Depth', 'bg-sky-800'],
                ['help', 'Need help', 'bg-rose-600'],
                ['safe', 'Water receded', 'bg-emerald-700'],
              ] as const).map(([k, label, active]) => (
                <button
                  key={k}
                  onClick={() => setForm({ ...form, kind: k })}
                  className={`font-mono text-[9px] uppercase font-bold tracking-wider py-2 rounded-xl border transition-all ${
                    form.kind === k
                      ? `${active} text-white border-transparent`
                      : 'bg-white dark:bg-zinc-800 border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {form.kind === 'depth' && (
              <input
                type="number"
                value={form.depthCm}
                onChange={(e) => setForm({ ...form, depthCm: e.target.value })}
                placeholder="Water depth (cm) — e.g. 35"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-sky-400"
              />
            )}

            <input
              value={form.areaLabel}
              onChange={(e) => setForm({ ...form, areaLabel: e.target.value })}
              placeholder="Fuzzy area (e.g. North Beach, around the market)"
              className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-sky-400"
            />
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={form.kind === 'help' ? "What's the situation? Who needs help, and what help?" : 'Anything neighbours should know (optional)'}
              rows={3}
              className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-sky-400 resize-none"
            />

            {/* GPS opt-in */}
            <button
              onClick={() => {
                if (form.shareLocation) {
                  setForm({ ...form, shareLocation: false });
                  setGps(null);
                } else {
                  grabLocation();
                }
              }}
              disabled={gpsBusy}
              className={`font-mono text-[9px] uppercase font-bold tracking-wider py-2 px-3 rounded-xl border transition-all flex items-center gap-1.5 ${
                form.shareLocation
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white dark:bg-zinc-800 border-[#ebdcca] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300'
              } disabled:opacity-50`}
            >
              <LocateFixed size={12} />
              {gpsBusy ? 'Locating…' : form.shareLocation ? 'Precise location ON (shared this tap)' : 'Share precise location (opt-in)'}
            </button>

            <button
              onClick={submitReport} disabled={saving}
              className={`w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                form.kind === 'help'
                  ? 'bg-rose-600 text-white hover:bg-rose-500'
                  : form.kind === 'safe'
                    ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                    : 'bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b]'
              }`}
            >
              {form.kind === 'help' ? <Siren size={13} /> : <Droplets size={13} />}
              {saving ? 'Posting…' : form.kind === 'help' ? 'Raise help request' : form.kind === 'safe' ? 'Water receded here' : 'Report water depth'}
            </button>
            <p className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">
              Rate-limited: 2 flood updates per 15 minutes. Confirmations pay helpers, never posters.
            </p>
          </div>
        )}

        {/* ===================== FLOOD SPOTS ===================== */}
        {tab === 'spots' && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/60 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-[#5c5446] dark:text-zinc-300" />
                <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#3a342a] dark:text-zinc-100">Add a known flood-prone spot</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={spotForm.areaLabel}
                  onChange={(e) => setSpotForm({ ...spotForm, areaLabel: e.target.value })}
                  placeholder="Fuzzy area (e.g. Bridge road dip)"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400"
                />
                <input
                  type="number"
                  value={spotForm.typicalDepthCm}
                  onChange={(e) => setSpotForm({ ...spotForm, typicalDepthCm: e.target.value })}
                  placeholder="Typical depth (cm)"
                  className="bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400"
                />
              </div>
              <select
                value={spotForm.riskLevel}
                onChange={(e) => setSpotForm({ ...spotForm, riskLevel: e.target.value as RiskLevel })}
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-2 py-2 text-sm"
              >
                {(['low', 'moderate', 'high', 'severe'] as RiskLevel[]).map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <input
                value={spotForm.note}
                onChange={(e) => setSpotForm({ ...spotForm, note: e.target.value })}
                placeholder="Note (optional)"
                className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
              <button
                onClick={addSpot} disabled={saving}
                className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] disabled:opacity-50 transition-all flex items-center justify-center gap-1"
              >
                <Plus size={13} /> {saving ? 'Adding…' : 'Add flood spot'}
              </button>
            </div>

            {spots.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <MapPin className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No flood-prone spots listed yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {spots.map((s) => (
                  <motion.div key={s.id} layout className="rounded-xl border border-[#ebdcca] dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <MapPin size={12} className="text-[#8a8172]" />
                      <span className="text-sm font-bold text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{s.areaLabel}</span>
                      <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${RISK_BADGE[s.riskLevel] || 'bg-emerald-50 text-emerald-600'}`}>{s.riskLabel}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
                      <span className="flex items-center gap-1 normal-case"><Droplets size={11} /> {depthLabel(s.typicalDepthCm)}</span>
                      <span className="flex items-center gap-1"><Users size={11} /> {s.confirmations} confirmed</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(s.createdAt)}</span>
                    </div>
                    {s.note && <p className="text-[10px] text-[#5c5446] dark:text-zinc-300">{s.note}</p>}
                    {!s.isMine && !s.confirmedByMe && (
                      <button
                        onClick={() => confirmSpot(s)}
                        className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-all flex items-center gap-1"
                      >
                        <CheckCircle2 size={11} /> Confirm
                      </button>
                    )}
                    {s.confirmedByMe && (
                      <span className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center gap-1">
                        <CheckCircle2 size={11} /> Confirmed
                      </span>
                    )}
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
              <div className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">Your flood updates</div>
              <button
                onClick={loadMine}
                className="font-mono text-[9px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 hover:text-[#3a342a] dark:hover:text-zinc-100"
              >
                Refresh
              </button>
            </div>
            {loading ? (
              <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading…</div>
            ) : reports.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Footprints className="mx-auto text-[#8a8172] dark:text-zinc-500" size={24} />
                <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">Nothing reported by you yet.</p>
              </div>
            ) : (
              reports.map((r) => (
                <FloodCard
                  key={r.id}
                  report={r}
                  onConfirm={() => confirmReport(r)}
                  onAck={() => ackReport(r)}
                  onResolve={() => resolveReport(r)}
                  showControls
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flood report card
// ---------------------------------------------------------------------------

function FloodCard({
  report, onConfirm, onAck, onResolve, showControls,
}: {
  key?: string | number;
  report: FloodReport;
  onConfirm: () => void;
  onAck: () => void;
  onResolve: () => void;
  showControls?: boolean;
}) {
  const isOpen = report.status === 'active' || report.status === 'confirmed';
  const isMine = report.isMine;
  const isHelp = report.kind === 'help';

  return (
    <motion.div layout className={`rounded-2xl border p-4 shadow-sm ${isHelp ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20' : 'border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70'}`}>
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${isHelp ? 'bg-rose-500 animate-pulse' : report.kind === 'depth' ? 'bg-sky-500' : 'bg-emerald-500'}`} />
        <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full uppercase ${KIND_BADGE[report.kind] || 'bg-zinc-100 text-zinc-500'}`}>
          {isHelp ? <Siren size={9} className="inline mr-1" /> : <Droplets size={9} className="inline mr-1" />}
          {report.kindLabel}
        </span>
        <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full uppercase ${report.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600' : report.status === 'resolved' ? 'bg-zinc-100 text-zinc-500' : 'bg-amber-50 text-amber-600'}`}>
          {report.status.replace('_', ' ')}
        </span>
      </div>

      {report.kind === 'depth' && (
        <div className="mt-2 flex items-center gap-2">
          <Droplets size={14} className="text-sky-700" />
          <span className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100">{depthLabel(report.depthCm)}</span>
        </div>
      )}

      {report.note && <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-1">{report.note}</p>}

      <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
        <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {report.areaLabel}</span>
        <span className="flex items-center gap-1"><Clock size={11} /> {timeAgo(report.createdAt)}</span>
        <span className="flex items-center gap-1"><Users size={11} /> {report.createdByName}</span>
        {report.shareLocation && (
          <span className="flex items-center gap-1 text-emerald-600"><LocateFixed size={11} /> precise shared</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {report.kind === 'depth' && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 self-center">
            <CheckCircle2 size={11} className="inline mr-1" />{report.confirmations} confirmed
          </span>
        )}
        {report.kind === 'help' && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 self-center">
            <LifeBuoy size={11} className="inline mr-1" />{report.ackCount} responding
          </span>
        )}

        <div className="ml-auto flex gap-2">
          {report.kind === 'help' && isOpen && !isMine && !report.myAck && report.canAck && (
            <button onClick={onAck} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-rose-600 text-white hover:bg-rose-500 transition-all flex items-center gap-1">
              <LifeBuoy size={11} /> On my way
            </button>
          )}
          {report.kind === 'help' && report.myAck && (
            <span className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center gap-1">
              <CheckCircle2 size={11} /> Responding
            </span>
          )}

          {report.kind === 'depth' && report.canConfirm && isOpen && (
            <button onClick={onConfirm} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-all flex items-center gap-1">
              <CheckCircle2 size={11} /> Confirm
            </button>
          )}

          {(showControls || isMine) && isOpen && (
            <button onClick={onResolve} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800 hover:bg-emerald-200 transition-all flex items-center gap-1">
              <CheckCircle2 size={11} /> Resolve
            </button>
          )}
        </div>
      </div>

      {report.status === 'resolved' && report.resolvedByName && (
        <div className="mt-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-900/50 px-2.5 py-1.5 text-[10px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
          <CheckCircle2 size={11} />
          Resolved by {report.resolvedByName}
        </div>
      )}
    </motion.div>
  );
}
