import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UserSearch, X, MapPin, Clock, Users, HeartHandshake, ShieldAlert, AlertTriangle,
  Plus, CheckCircle2, LocateFixed, Send, BadgeCheck, Wallet, Camera, Search,
  ChevronDown, ChevronUp, Phone, Eye,
} from 'lucide-react';

/**
 * Ocean — Missing Person Community Alerts
 * ----------------------------------------
 * A civic-resilience feature that extends the Emergency UX (EmergencyView /
 * SafeSOS / Safe Shelter / Blood Donor Registry):
 *  - File a missing-person report with a fuzzy last-seen area (always shared).
 *    Precise last-seen coords are stored ONLY if the reporter opts in on that
 *    press; they are never shown in list views.
 *  - The community submits sightings / information. Precise sighting coords are
 *    attached only on explicit opt-in and revealed only to the reporter and the
 *    sighter.
 *  - Neighbours verify a report is real; the reporter marks the person found safe.
 *  - Safety coins: +10 first sighting, +5 verify, +20 to the most-voted sighting
 *    author when someone is found safe.
 *
 * Backed by /api/missing/* (turtleMissingPersonBackend.ts).
 */

type Status = 'active' | 'found_safe' | 'withdrawn';
type SightingKind = 'sighting' | 'information';

interface Sighting {
  id: string;
  reportId: string;
  sighterId: string;
  sighterName: string;
  kind: SightingKind;
  note: string;
  areaLabel?: string;
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  helpfulBy: string[];
  createdAt: number;
}

interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  personName: string;
  age?: number;
  gender?: string;
  description: string;
  photoUrl?: string;
  areaLabel: string;
  lastSeenAt: number;
  lastSeenText?: string;
  shareLocation: boolean;
  lat?: number;
  lng?: number;
  contactNote?: string;
  status: Status;
  foundNotes?: string;
  verifierCount: number;
  sightingCount: number;
  sightings?: Sighting[];
  verifierIds?: string[];
  createdAt: number;
  updatedAt: number;
}

interface StatusSummary {
  myReportCount: number;
  activeCount: number;
  mySightingCount: number;
  balance: number;
}

interface MissingPersonViewProps {
  token: string | null;
  currentUser: { id: string; name: string } | null;
  onClose: () => void;
}

const STATUS_BADGE: Record<Status, string> = {
  active: 'bg-rose-50 text-rose-500',
  found_safe: 'bg-emerald-50 text-emerald-600',
  withdrawn: 'bg-zinc-100 text-zinc-500',
};

const GENDERS = ['', 'male', 'female', 'other'];

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtDate(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    (d.getHours() + d.getMinutes() > 0
      ? ` · ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
      : '');
}

function initials(name: string): string {
  return (name || '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Report card
// ---------------------------------------------------------------------------

function ReportCard({
  report, me, expanded, onToggle, onOpenDetail, onChanged, api, toast,
}: {
  key?: string | number;
  report: Report; me: { id: string; name: string } | null;
  expanded: boolean; onToggle: () => void; onOpenDetail: () => void;
  onChanged: () => void;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void;
}) {
  const isOwner = me?.id === report.reporterId;
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [foundOpen, setFoundOpen] = useState(false);
  const [foundNotes, setFoundNotes] = useState('');
  const [reportOpen, setReportOpen] = useState(false);

  const verify = async () => {
    setVerifyBusy(true);
    try {
      await api(`/api/missing/reports/${report.id}/verify`, 'POST');
      toast('Report verified (+5 coins).');
      onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setVerifyBusy(false); }
  };

  const markFound = async () => {
    try {
      await api(`/api/missing/reports/${report.id}/found`, 'POST', { foundNotes: foundNotes.trim() });
      toast('Marked found safe.');
      setFoundOpen(false);
      onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const reportFake = async () => {
    try {
      await api(`/api/missing/reports/${report.id}/report`, 'POST', { reason: 'fake_report' });
      toast('Report submitted. Fake listings are removed after 3 reports.');
      setReportOpen(false);
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  return (
    <div className="rounded-2xl border border-[#ebdcca] dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {report.photoUrl ? (
          <img
            src={report.photoUrl} alt={report.personName}
            className="w-14 h-14 rounded-xl object-cover border border-[#ebdcca] dark:border-zinc-700"
          />
        ) : (
          <span className="w-14 h-14 rounded-xl bg-[#ebdcca]/50 dark:bg-zinc-800 flex items-center justify-center font-display font-bold text-[#5c5446] dark:text-zinc-300 shrink-0">
            {initials(report.personName)}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-sm text-[#3a342a] dark:text-zinc-100 flex-1 truncate">{report.personName}</h3>
            <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${STATUS_BADGE[report.status]}`}>{report.status.replace('_', ' ')}</span>
          </div>
          <p className="text-xs text-[#5c5446] dark:text-zinc-300 mt-0.5 truncate">
            {[report.age ? `${report.age} yrs` : '', report.gender, report.description].filter(Boolean).join(' · ')}
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] text-[#8a8172] dark:text-zinc-400 font-mono uppercase tracking-wide">
            <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> {report.areaLabel}</span>
            {report.lastSeenText && <span className="flex items-center gap-1 normal-case"><Clock size={11} /> {report.lastSeenText}</span>}
            <span>{timeAgo(report.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          onClick={onOpenDetail}
          className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] transition-all flex items-center gap-1"
        >
          <Eye size={11} /> Details & sighting
        </button>
        {!isOwner && report.status === 'active' && (
          <button
            onClick={verify} disabled={verifyBusy}
            className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-transparent text-emerald-700 dark:text-emerald-400 border border-emerald-300/50 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-all flex items-center gap-1 disabled:opacity-50"
          >
            <BadgeCheck size={11} /> Verify real
          </button>
        )}
        {isOwner && report.status === 'active' && (
          <button
            onClick={() => setFoundOpen(true)}
            className="font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-lg bg-emerald-700 text-white dark:bg-emerald-600 hover:bg-emerald-800 transition-all flex items-center gap-1"
          >
            <CheckCircle2 size={11} /> Found safe
          </button>
        )}
        <button
          onClick={() => setReportOpen(true)}
          className="ml-auto text-[#8a8172] dark:text-zinc-500 hover:text-red-600 transition-colors" title="Report fake listing"
        >
          <ShieldAlert size={14} />
        </button>
      </div>

      <button
        onClick={onToggle}
        className="mt-2 text-[9px] font-mono uppercase tracking-wider text-[#8a8172] dark:text-zinc-500 hover:text-[#5c5446] flex items-center gap-1"
      >
        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        {expanded ? 'Hide summary' : 'Summary'}
      </button>

      {expanded && (
        <div className="mt-2 border-t border-[#ebdcca]/60 dark:border-zinc-800 pt-2 text-xs text-[#5c5446] dark:text-zinc-300 space-y-1">
          <p>{report.description}</p>
          <div className="flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-wide text-[#8a8172] dark:text-zinc-400">
            <span className="flex items-center gap-1"><Users size={11} /> {report.sightingCount} sightings</span>
            <span className="flex items-center gap-1"><BadgeCheck size={11} /> {report.verifierCount} verified</span>
            <span>Last seen {fmtDate(report.lastSeenAt)}</span>
          </div>
        </div>
      )}

      {foundOpen && (
        <div className="mt-3 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 space-y-2">
          <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-emerald-700 dark:text-emerald-300">Mark found safe</p>
          <textarea
            value={foundNotes} onChange={e => setFoundNotes(e.target.value)}
            placeholder="Great news — how were they found? (optional)" rows={2}
            className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs outline-none resize-none"
          />
          <div className="flex gap-2">
            <button onClick={markFound} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800">Confirm found</button>
            <button onClick={() => setFoundOpen(false)} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-transparent text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700">Cancel</button>
          </div>
        </div>
      )}

      {reportOpen && (
        <div className="mt-3 rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50/60 dark:bg-red-950/30 p-3 space-y-2">
          <p className="text-[10px] font-mono uppercase font-bold tracking-wider text-red-700 dark:text-red-300 flex items-center gap-1">
            <AlertTriangle size={11} /> Report this listing
          </p>
          <p className="text-[10px] text-[#5c5446] dark:text-zinc-300">Fake, spammy or commercial listings are removed after 3 reports.</p>
          <div className="flex gap-2">
            <button onClick={reportFake} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700">Report</button>
            <button onClick={() => setReportOpen(false)} className="font-mono text-[9px] uppercase font-bold tracking-wider py-1 px-3 rounded-lg bg-transparent text-[#8a8172] border border-[#ebdcca] dark:border-zinc-700">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create report dialog
// ---------------------------------------------------------------------------

function CreateReportDialog({
  onClose, onCreate, api, toast,
}: {
  onClose: () => void; onCreate: () => void;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void;
}) {
  const [form, setForm] = useState({
    personName: '', age: '', gender: '', description: '', areaLabel: '',
    lastSeenText: '', contactNote: '', shareLocation: false, lat: 0, lng: 0,
  });
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const toLocalInput = (ts: number): string => {
    const d = new Date(ts);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const [lastSeenAt, setLastSeenAt] = useState(() => toLocalInput(Date.now()));

  const geo = () => {
    if (!navigator.geolocation) return toast('Geolocation is not available.');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, shareLocation: true, lat: pos.coords.latitude, lng: pos.coords.longitude }));
        toast('Precise location attached to this report (only shared on your opt-in).');
      },
      () => toast('Could not get your location.', 'destructive'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      // /api/upload now requires auth — read the session token from storage
      // (same key the main app uses for its upload helper).
      const storedToken = localStorage.getItem('secure_auth_token');
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error('Photo upload failed.');
      const data = await res.json();
      setPhotoUrl(data.url || '');
    } catch (e: any) { toast(e.message || 'Photo upload failed.', 'destructive'); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (form.personName.trim().length < 2) return toast('The person\'s name is required.');
    if (form.description.trim().length < 10) return toast('Description must be at least 10 characters.');
    if (form.areaLabel.trim().length < 2) return toast('Last-seen area is required (an approximate area is fine).');
    setSaving(true);
    try {
      await api('/api/missing/reports', 'POST', {
        ...form,
        age: form.age ? Number(form.age) : undefined,
        photoUrl: photoUrl || undefined,
        lastSeenAt: new Date(lastSeenAt).getTime(),
        shareLocation: form.shareLocation && !!form.lat && !!form.lng,
      });
      toast('Missing-person report filed. The community has been notified.');
      onCreate();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setSaving(false); }
  };

  const inputCls = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
        className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-md border-2 border-[#ebdcca] dark:border-zinc-800 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-[#3a342a] dark:text-zinc-100 flex items-center gap-2">
            <UserSearch className="text-rose-600" size={16} /> File Missing-Person Report
          </h3>
          <button onClick={onClose} className="text-[#8a8172] hover:text-[#3a342a]"><X size={16} /></button>
        </div>

        {/* Photo */}
        <div className="flex items-center gap-3">
          {photoUrl ? (
            <img src={photoUrl} alt="person" className="w-16 h-16 rounded-xl object-cover border border-[#ebdcca] dark:border-zinc-700" />
          ) : (
            <span className="w-16 h-16 rounded-xl bg-[#ebdcca]/50 dark:bg-zinc-800 flex items-center justify-center text-[#8a8172]"><Camera size={18} /></span>
          )}
          <label className="flex-1 font-mono text-[9px] uppercase font-bold tracking-wider py-2 px-3 rounded-xl bg-white dark:bg-zinc-800 border border-[#cfcac0] dark:border-zinc-700 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/30 cursor-pointer text-center">
            {uploading ? 'Uploading…' : 'Upload photo'}
            <input type="file" accept="image/*" className="hidden" disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input value={form.personName} onChange={(e) => setForm({ ...form, personName: e.target.value })}
            placeholder="Full name" className={inputCls} />
          <input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })}
            placeholder="Age" className={inputCls} />
        </div>
        <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className={inputCls}>
          {GENDERS.map((g) => <option key={g} value={g}>{g ? g.charAt(0).toUpperCase() + g.slice(1) : 'Gender (optional)'}</option>)}
        </select>
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Physical description, clothing, distinguishing marks, circumstances…" rows={3} className={inputCls + ' resize-none'} />
        <input value={form.areaLabel} onChange={(e) => setForm({ ...form, areaLabel: e.target.value })}
          placeholder="Last seen area (approx., e.g. North Beach market)" className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <input type="datetime-local" value={lastSeenAt} onChange={(e) => setLastSeenAt(e.target.value)} className={inputCls} />
          <input value={form.lastSeenText} onChange={(e) => setForm({ ...form, lastSeenText: e.target.value })}
            placeholder="e.g. Saturday, ~6pm" className={inputCls} />
        </div>
        <input value={form.contactNote} onChange={(e) => setForm({ ...form, contactNote: e.target.value })}
          placeholder="How to reach the family (phone / relation) — only shared with helpers" className={inputCls} />

        {/* Precise location opt-in */}
        <label className="flex items-start gap-2 text-xs text-[#5c5446] dark:text-zinc-300 rounded-xl border border-[#ebdcca] dark:border-zinc-700 bg-white/60 dark:bg-zinc-800/60 p-3 cursor-pointer">
          <input type="checkbox" checked={form.shareLocation} onChange={(e) => setForm({ ...form, shareLocation: e.target.checked })}
            className="mt-0.5 accent-rose-600" />
          <span className="flex-1">
            <span className="font-bold block">Share my precise last-seen location</span>
            <span className="font-mono text-[9px] uppercase tracking-wide text-[#8a8172]">Optional — revealed only to helpers, never in lists</span>
          </span>
          <button onClick={(e) => { e.preventDefault(); geo(); }} className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold px-2 py-1 rounded-lg bg-rose-600 text-white hover:bg-rose-500">
            <LocateFixed size={10} /> GPS
          </button>
        </label>
        {form.shareLocation && form.lat !== 0 && (
          <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172]">Precise location attached ({form.lat.toFixed(4)}, {form.lng.toFixed(4)})</p>
        )}

        <button
          onClick={submit} disabled={saving}
          className="w-full font-mono text-[10px] uppercase font-bold tracking-wider py-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
        >
          <Send size={12} /> {saving ? 'Filing…' : 'File report'}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Detail modal (report + sightings)
// ---------------------------------------------------------------------------

function DetailModal({
  reportId, me, api, toast, onChanged, onClose,
}: {
  reportId: string; me: { id: string; name: string } | null;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  toast: (m: string, v?: string) => void; onChanged: () => void; onClose: () => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ kind: 'sighting' as SightingKind, note: '', areaLabel: '', shareLocation: false, lat: 0, lng: 0 });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/api/missing/reports/${reportId}`, 'GET');
      setReport(data.report);
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setLoading(false); }
  }, [reportId, api, toast]);

  useEffect(() => { load(); }, [load]);

  const isOwner = me?.id === report?.reporterId;
  const isSighter = report?.sightings?.some((s) => s.sighterId === me?.id);
  const canSeeContact = isOwner || isSighter;

  const geo = () => {
    if (!navigator.geolocation) return toast('Geolocation is not available.');
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, shareLocation: true, lat: pos.coords.latitude, lng: pos.coords.longitude })),
      () => toast('Could not get your location.', 'destructive'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const submitSighting = async () => {
    if (form.note.trim().length < 5) return toast('Please describe what you saw or the information you have.');
    setSubmitting(true);
    try {
      const data = await api(`/api/missing/reports/${reportId}/sightings`, 'POST', {
        ...form,
        shareLocation: form.shareLocation && !!form.lat && !!form.lng,
      });
      setForm({ kind: 'sighting', note: '', areaLabel: '', shareLocation: false, lat: 0, lng: 0 });
      toast(data.coinAwarded ? 'Sighting shared (+10 coins).' : 'Sighting shared.');
      load(); onChanged();
    } catch (e: any) { toast(e.message, 'destructive'); }
    finally { setSubmitting(false); }
  };

  const toggleHelpful = async (s: Sighting) => {
    try {
      await api(`/api/missing/reports/${reportId}/sightings/${s.id}/helpful`, 'POST');
      load();
    } catch (e: any) { toast(e.message, 'destructive'); }
  };

  const inputCls = 'w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
        className="bg-[#fcfaf4] dark:bg-zinc-900 rounded-[1.75rem] p-6 w-full max-w-lg border-2 border-[#ebdcca] dark:border-zinc-800 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !report ? (
          <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172]">Loading…</div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              {report.photoUrl ? (
                <img src={report.photoUrl} alt={report.personName} className="w-16 h-16 rounded-xl object-cover border border-[#ebdcca] dark:border-zinc-700" />
              ) : (
                <span className="w-16 h-16 rounded-xl bg-[#ebdcca]/50 dark:bg-zinc-800 flex items-center justify-center font-display font-bold text-[#5c5446] dark:text-zinc-300 shrink-0">
                  {initials(report.personName)}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-bold text-lg text-[#3a342a] dark:text-zinc-100 truncate">{report.personName}</h3>
                  <button onClick={onClose} className="text-[#8a8172] hover:text-[#3a342a] shrink-0"><X size={16} /></button>
                </div>
                <p className="text-xs text-[#5c5446] dark:text-zinc-300">
                  {[report.age ? `${report.age} yrs` : '', report.gender].filter(Boolean).join(' · ') || 'Age unknown'}
                </p>
                <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 rounded-full ${STATUS_BADGE[report.status]}`}>{report.status.replace('_', ' ')}</span>
              </div>
            </div>

            <div className="text-xs text-[#5c5446] dark:text-zinc-300 leading-relaxed">{report.description}</div>

            <div className="flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-wide text-[#8a8172] dark:text-zinc-400">
              <span className="flex items-center gap-1 normal-case"><MapPin size={11} /> Last seen: {report.areaLabel}</span>
              <span className="flex items-center gap-1 normal-case"><Clock size={11} /> {report.lastSeenText || fmtDate(report.lastSeenAt)}</span>
              <span className="flex items-center gap-1"><Users size={11} /> {report.sightingCount} sightings</span>
              <span className="flex items-center gap-1"><BadgeCheck size={11} /> {report.verifierCount} verified</span>
            </div>

            {report.shareLocation && report.lat !== undefined && canSeeContact && (
              <p className="font-mono text-[9px] uppercase tracking-wider text-rose-600 flex items-center gap-1">
                <LocateFixed size={11} /> Precise last-seen location shared with you
              </p>
            )}

            {report.contactNote && canSeeContact ? (
              <p className="text-xs text-[#3a342a] dark:text-zinc-100 flex items-center gap-1.5 rounded-xl bg-white/60 dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 p-3">
                <Phone size={13} className="text-emerald-600 shrink-0" /> {report.contactNote}
              </p>
            ) : (
              <p className="text-[10px] font-mono uppercase tracking-wider text-[#8a8172]">
                Contact details unlock once you submit a sighting.
              </p>
            )}

            {report.status === 'found_safe' && report.foundNotes && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 text-xs text-emerald-800 dark:text-emerald-200">
                <b>Found safe:</b> {report.foundNotes}
              </div>
            )}

            {/* Sightings */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-mono text-[10px] uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300">Community sightings &amp; info</h4>
              </div>
              {!report.sightings?.length ? (
                <p className="text-[11px] text-[#8a8172] dark:text-zinc-400">No sightings yet. If you saw this person or have information, share it below.</p>
              ) : (
                <div className="space-y-2">
                  {report.sightings.map((s) => (
                    <div key={s.id} className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-bold text-[#3a342a] dark:text-zinc-100">{s.sighterName}</span>
                        <span className="font-mono text-[9px] uppercase text-[#8a8172]">{s.kind}</span>
                      </div>
                      <p className="text-[#5c5446] dark:text-zinc-300">{s.note}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono uppercase text-[#8a8172]">
                        {s.areaLabel && <span className="flex items-center gap-1 normal-case"><MapPin size={10} /> {s.areaLabel}</span>}
                        <span>{timeAgo(s.createdAt)}</span>
                        {s.shareLocation && s.lat !== undefined && (isOwner || s.sighterId === me?.id) && (
                          <span className="flex items-center gap-1 text-rose-600"><LocateFixed size={10} /> precise coords</span>
                        )}
                        <button
                          onClick={() => toggleHelpful(s)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors ${s.helpfulBy.includes(me?.id || '') ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300' : 'bg-[#ebdcca]/40 dark:bg-zinc-800 text-[#5c5446] dark:text-zinc-300 hover:bg-[#ebdcca]/70'}`}
                        >
                          <CheckCircle2 size={10} /> helpful {s.helpfulBy.length > 0 ? s.helpfulBy.length : ''}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit sighting */}
            {report.status === 'active' && !isOwner && (
              <div className="rounded-xl border border-[#ebdcca]/70 dark:border-zinc-700 p-3 space-y-2">
                <div className="text-[10px] font-mono uppercase font-bold tracking-wider text-[#5c5446] dark:text-zinc-300 flex items-center gap-1">
                  <Eye size={11} /> I saw them / I have information
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SightingKind })} className={inputCls}>
                    <option value="sighting">Sighting</option>
                    <option value="information">Information</option>
                  </select>
                  <input value={form.areaLabel} onChange={(e) => setForm({ ...form, areaLabel: e.target.value })}
                    placeholder="Where (approx.)" className={inputCls} />
                </div>
                <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="When/where did you see them? What were they wearing?" rows={2} className={inputCls + ' resize-none'} />
                <label className="flex items-center gap-2 text-[11px] text-[#5c5446] dark:text-zinc-300">
                  <input type="checkbox" checked={form.shareLocation} onChange={(e) => setForm({ ...form, shareLocation: e.target.checked })} className="accent-rose-600" />
                  Share my precise location for this sighting
                  <button onClick={(e) => { e.preventDefault(); geo(); }} className="flex items-center gap-1 font-mono text-[9px] uppercase font-bold px-2 py-1 rounded-lg bg-rose-600 text-white hover:bg-rose-500 ml-auto">
                    <LocateFixed size={10} /> GPS
                  </button>
                </label>
                <button onClick={submitSighting} disabled={submitting}
                  className="w-full font-mono text-[9px] uppercase font-bold tracking-wider py-2 rounded-lg bg-[#3a342a] text-[#f4f1ea] hover:bg-[#52493b] disabled:opacity-50 flex items-center justify-center gap-1">
                  <Send size={11} /> {submitting ? 'Sharing…' : 'Share sighting'}
                </button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function MissingPersonView({ token, currentUser, onClose }: MissingPersonViewProps) {
  const [tab, setTab] = useState<'active' | 'found' | 'mine'>('active');
  const [area, setArea] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState<StatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('status', tab);
      if (area.trim()) q.set('area', area.trim());
      const res = await fetch(`/api/missing/reports?${q.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
        if (typeof data.balance === 'number') {
          setStatus((s) => ({ ...(s || { myReportCount: 0, activeCount: 0, mySightingCount: 0 }), balance: data.balance }));
        }
      }
    } catch (e) {
      console.error('Failed to load missing-person reports:', e);
    }
    setLoading(false);
  }, [token, tab, area]);

  useEffect(() => { load(); }, [load]);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/missing/status', {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStatus(await res.json());
    } catch (e) { /* guest-safe */ }
  }, [token]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const chipCls = (active: boolean) =>
    `font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full transition-all ${
      active
        ? 'bg-amber-800 text-white dark:bg-amber-400 dark:text-zinc-900'
        : 'bg-[#ebdcca]/30 text-[#5c5446] dark:bg-zinc-800 dark:text-zinc-400 hover:bg-[#ebdcca]/60'
    }`;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[115] bg-[#141b2b]/55 dark:bg-[#05060c]/85 backdrop-blur-sm overflow-y-auto py-6 px-4"
    >
      <div className="max-w-xl mx-auto space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-rose-600/10 flex items-center justify-center">
              <UserSearch className="text-rose-600" size={18} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-[#3a342a] dark:text-zinc-100">Missing Person Alerts</h2>
              <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">
                Community search · sightings · found safe
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
            Sign in to file a report, submit a sighting, or verify a listing.
          </div>
        )}

        {/* Status strip */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <Wallet className="mx-auto text-amber-600" size={15} />
            <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.balance ?? '—'}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">safety coins</div>
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <Users className={`mx-auto text-rose-600 ${(status?.activeCount || 0) > 0 ? 'animate-pulse' : ''}`} size={15} />
            <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.activeCount ?? reports.filter((r) => r.status === 'active').length}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">active reports</div>
          </div>
          <div className="bg-[#fcfaf4] dark:bg-zinc-900 border border-[#ebdcca] dark:border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <Eye className="mx-auto text-emerald-600" size={15} />
            <div className="font-mono text-sm font-bold text-[#3a342a] dark:text-zinc-100 mt-1">{status?.mySightingCount ?? 0}</div>
            <div className="font-mono text-[8px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">my sightings</div>
          </div>
        </div>

        {/* Tabs + new report */}
        <div className="flex gap-2 flex-wrap">
          {([['active', 'Active'], ['found', 'Found'], ['mine', 'Mine']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={chipCls(tab === k)}>{label}</button>
          ))}
          <div className="flex-1" />
          {token && (
            <button
              onClick={() => setCreateOpen(true)}
              className="ml-auto font-mono text-[9px] uppercase font-bold tracking-wider py-1.5 px-3 rounded-full bg-rose-700 text-white dark:bg-rose-500 hover:bg-rose-800 transition-all flex items-center gap-1"
            >
              <Plus size={11} /> New report
            </button>
          )}
        </div>

        {/* Area filter */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8172]" />
          <input
            value={area} onChange={(e) => setArea(e.target.value)}
            placeholder="Filter by area or name…"
            className="w-full bg-white dark:bg-zinc-800 border border-[#ebdcca] dark:border-zinc-700 rounded-xl pl-8 pr-3 py-2 text-xs text-[#3a342a] dark:text-zinc-100 outline-none focus:border-amber-400"
          />
        </div>

        {/* Report list */}
        {loading ? (
          <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-400">Loading reports…</div>
        ) : reports.length === 0 ? (
          <div className="py-14 text-center space-y-2">
            <HeartHandshake className="mx-auto text-[#8a8172] dark:text-zinc-500" size={26} />
            <p className="font-display text-sm text-[#5c5446] dark:text-zinc-300">No missing-person reports here yet.</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#8a8172] dark:text-zinc-500">File a report to rally the neighbourhood</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                me={currentUser}
                expanded={expandedId === report.id}
                onToggle={() => setExpandedId(expandedId === report.id ? null : report.id)}
                onOpenDetail={() => setDetailId(report.id)}
                onChanged={() => { load(); loadStatus(); }}
                api={api}
                toast={toast}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AnimatePresence>
        {createOpen && (
          <CreateReportDialog
            onClose={() => setCreateOpen(false)}
            onCreate={() => { setCreateOpen(false); load(); loadStatus(); }}
            api={api}
            toast={toast}
          />
        )}
        {detailId && (
          <DetailModal
            reportId={detailId}
            me={currentUser}
            api={api}
            toast={toast}
            onChanged={() => { load(); loadStatus(); }}
            onClose={() => setDetailId(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
